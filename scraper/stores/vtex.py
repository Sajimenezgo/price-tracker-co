"""Base para tiendas VTEX (Éxito, Jumbo): API pública Catalog System.

GET /api/catalog_system/pub/products/search/{ruta/categoria}?_from=0&_to=49
"""
from __future__ import annotations

import logging
from typing import Iterator

from .. import config
from .base import BaseScraper

log = logging.getLogger(__name__)


def _teaser_params(teaser: dict) -> dict:
    """Los teasers VTEX vienen con claves tipo '<Name>k__BackingField'; las aplanamos."""
    def clean(k: str) -> str:
        return k.replace("<", "").replace(">k__BackingField", "")
    out = {"name": teaser.get("<Name>k__BackingField", "")}
    cond = teaser.get("<Conditions>k__BackingField", {}) or {}
    eff = teaser.get("<Effects>k__BackingField", {}) or {}
    out["conditions"] = {p["<Name>k__BackingField"]: p["<Value>k__BackingField"]
                         for p in cond.get("<Parameters>k__BackingField", [])}
    out["effects"] = {p["<Name>k__BackingField"]: p["<Value>k__BackingField"]
                      for p in eff.get("<Parameters>k__BackingField", [])}
    return out


def card_price_from_offer(offer: dict) -> float | None:
    """Precio exclusivo por medio de pago.

    VTEX modela estos descuentos como 'teasers' restringidos a BINs de tarjeta
    (RestrictionsBins). Se calcula el menor precio resultante:
      - PercentualDiscount: Price * (1 - pct/100)
      - PromotionalPriceTableItemsDiscount: ListPrice - descuento (heurística, ver README)
    """
    price = float(offer.get("Price") or 0)
    list_price = float(offer.get("ListPrice") or 0)
    best: float | None = None
    for raw in offer.get("Teasers") or []:
        t = _teaser_params(raw)
        if "RestrictionsBins" not in t["conditions"]:
            continue
        eff = t["effects"]
        cand = None
        try:
            if "PercentualDiscount" in eff:
                cand = price * (1 - float(eff["PercentualDiscount"]) / 100)
            elif "PromotionalPriceTableItemsDiscount" in eff:
                cand = list_price - float(eff["PromotionalPriceTableItemsDiscount"])
        except (TypeError, ValueError):
            continue
        if cand and 0 < cand < price and (best is None or cand < best):
            best = round(cand)
    return best


class VtexScraper(BaseScraper):
    categories_map: dict[str, str]
    card_type: str

    def categories(self) -> list[str]:
        return list(self.categories_map)

    def fetch_category(self, category: str) -> Iterator[dict]:
        path = self.categories_map[category]
        url = f"{self.base_url}/api/catalog_system/pub/products/search/{path}"
        start = 0
        while start < config.VTEX_MAX_ITEMS:
            resp = self.client.get(url, params={"_from": start, "_to": start + config.VTEX_PAGE_SIZE - 1})
            products = resp.json()
            if not isinstance(products, list) or not products:
                break
            for p in products:
                row = self.parse_product(p, category)
                if row:
                    yield row
            if len(products) < config.VTEX_PAGE_SIZE:
                break
            start += config.VTEX_PAGE_SIZE

    def parse_product(self, p: dict, category: str) -> dict | None:
        try:
            item = p["items"][0]
            offer = next(s["commertialOffer"] for s in item["sellers"] if s.get("sellerDefault", True))
        except (KeyError, IndexError, StopIteration):
            return None
        if not offer.get("IsAvailable") or not offer.get("Price"):
            return None
        images = item.get("images") or []
        return {
            "store": self.store,
            "category": category,
            "sku": str(p.get("productReference") or item.get("itemId")),
            "name": p.get("productName"),
            "brand": p.get("brand"),
            "regular_price": offer.get("ListPrice") or offer["Price"],
            "price": offer["Price"],
            "card_price": card_price_from_offer(offer),
            "card_type": self.card_type,
            "image_url": images[0]["imageUrl"] if images else None,
            "product_url": p.get("link"),
        }
