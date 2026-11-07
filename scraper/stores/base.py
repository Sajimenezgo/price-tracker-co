from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Iterator

from ..http_client import ResilientClient

log = logging.getLogger(__name__)

# Esquema común de salida de todos los scrapers (una fila = un SKU en una tienda)
FIELDS = ("store", "category", "sku", "name", "brand", "regular_price", "price",
          "card_price", "card_type", "image_url", "product_url")


class BaseScraper(ABC):
    store: str
    base_url: str

    def __init__(self):
        self.client = ResilientClient(referer=self.base_url)

    @abstractmethod
    def fetch_category(self, category: str) -> Iterator[dict]:
        """Rinde registros crudos normalizados al esquema FIELDS."""

    @abstractmethod
    def categories(self) -> list[str]: ...

    def run(self) -> list[dict]:
        rows: list[dict] = []
        for cat in self.categories():
            try:
                n0 = len(rows)
                rows.extend(self.fetch_category(cat))
                log.info("[%s] %s: %d productos", self.store, cat, len(rows) - n0)
            except Exception as exc:  # una categoría rota no debe tumbar todo el pipeline
                log.error("[%s] categoría %s falló: %s", self.store, cat, exc)
        return rows
