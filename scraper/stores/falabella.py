"""Falabella Colombia (Next.js).

El listado se hidrata desde un bloque JSON (`__NEXT_DATA__`) que el propio servidor de la
tienda emite con los resultados del buscador. No se usa ningún parser HTML: se extrae el
bloque JSON con una expresión regular y se carga con json.loads.
Cada producto trae `prices[]` con tipos: cmrPrice (tarjeta CMR), eventPrice/internetPrice, normalPrice.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Iterator

from .. import config
from .base import BaseScraper

log = logging.getLogger(__name__)
NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def parse_price(values: list[str] | None) -> float | None:
    if not values:
        return None
    digits = re.sub(r"[^\d]", "", str(values[0]).split(",")[0])  # "2.339.900" -> 2339900
    return float(digits) if digits else None


def find_results(node):
    """Busca recursivamente el dict de resultados (lista con 'prices' + 'pagination')."""
    if isinstance(node, dict):
        res = node.get("results")
        if isinstance(res, list) and res and isinstance(res[0], dict) and "prices" in res[0]:
            return node
        for v in node.values():
            found = find_results(v)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = find_results(v)
            if found:
                return found
    return None


class FalabellaScraper(BaseScraper):
    store = "falabella"
    base_url = "https://www.falabella.com.co"

    def categories(self) -> list[str]:
        return list(config.FALABELLA_QUERIES)

    def fetch_category(self, category: str) -> Iterator[dict]:
        query = config.FALABELLA_QUERIES[category]
        url = f"{self.base_url}/falabella-co/search"
        for page in range(1, config.FALABELLA_MAX_PAGES + 1):
            resp = self.client.get(url, params={"Ntt": query, "page": page}, accept="text/html,application/xhtml+xml")
            m = NEXT_DATA_RE.search(resp.text)
            if not m:
                log.warning("[falabella] sin __NEXT_DATA__ (posible bloqueo) en %s p.%d", query, page)
                break
            block = find_results(json.loads(m.group(1)))
            if not block or not block["results"]:
                break
            for r in block["results"]:
                row = self.parse_product(r, category)
                if row:
                    yield row
            pg = block.get("pagination") or {}
            if page * (pg.get("perPage") or 48) >= (pg.get("count") or 0):
                break

    def parse_product(self, r: dict, category: str) -> dict | None:
        prices = {p["type"]: parse_price(p.get("price")) for p in r.get("prices", [])}
        web = prices.get("internetPrice") or prices.get("eventPrice") or prices.get("normalPrice")
        cmr = prices.get("cmrPrice")
        if not web and cmr:
            web = cmr
        if not web:
            return None
        media = r.get("mediaUrls") or []
        return {
            "store": self.store,
            "category": category,
            "sku": str(r.get("skuId") or r.get("productId")),
            "name": r.get("displayName"),
            "brand": r.get("brand"),
            "regular_price": prices.get("normalPrice") or web,
            "price": web,
            "card_price": cmr if cmr and cmr < web else None,
            "card_type": "cmr",
            "image_url": media[0] if media else None,
            "product_url": r.get("url"),
        }
