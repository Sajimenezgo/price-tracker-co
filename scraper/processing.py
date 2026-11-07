"""Limpieza, normalización y transformación con Polars."""
from __future__ import annotations

from datetime import datetime, timezone

import polars as pl

from .stores.base import FIELDS

MIN_APPLIANCE_PRICE = 250_000   # descarta accesorios (organizadores, filtros, etc.)
KEYWORDS = r"(?i)\b(nevera|nevec[oó]n|refrigerador|congelador|lavadora|secadora|lavasecadora|centro de lavado)\b"
EXCLUDE = r"(?i)\b(organizador|repuesto|filtro|cubierta|funda|soporte|base|mueble|manguera|kit|cable|nevera port[aá]til|termo|cooler|garant[ií]a|plancha|mini lavadora|plegable|port[aá]til|vapor|aspiradora|extendida)\b"
# Modelo = último token alfanumérico (>=5) que mezcle letras y dígitos (p.ej. WT20NBTX6T, ERS433HBWD).
# Polars (regex de Rust) no soporta look-ahead, por eso se filtra la lista de tokens.
TOKEN_RE = r"\b[A-Za-z0-9]{5,}\b"


def model_expr() -> pl.Expr:
    toks = pl.col("name").str.extract_all(TOKEN_RE)
    good = toks.list.eval(
        pl.element().filter(pl.element().str.contains(r"[A-Za-z]") & pl.element().str.contains(r"\d"))
    )
    return good.list.last().str.to_uppercase().alias("model")


def build_dataframe(rows: list[dict]) -> pl.DataFrame:
    schema = {
        "store": pl.Utf8, "category": pl.Utf8, "sku": pl.Utf8, "name": pl.Utf8, "brand": pl.Utf8,
        "regular_price": pl.Float64, "price": pl.Float64, "card_price": pl.Float64,
        "card_type": pl.Utf8, "image_url": pl.Utf8, "product_url": pl.Utf8,
    }
    return pl.DataFrame(rows, schema=schema, strict=False) if rows else pl.DataFrame(schema=schema)


def clean(df: pl.DataFrame, scraped_at: datetime | None = None) -> pl.DataFrame:
    scraped_at = scraped_at or datetime.now(timezone.utc)
    if df.is_empty():
        return df
    df = (
        df.with_columns(
            pl.col("name").str.strip_chars().str.replace_all(r"\s+", " "),
            pl.col("brand").str.strip_chars().str.to_titlecase().fill_null("Sin marca"),
            pl.col("sku").str.strip_chars(),
        )
        .filter(pl.col("name").is_not_null() & pl.col("product_url").is_not_null())
        .filter(pl.col("name").str.contains(KEYWORDS))
        .filter(~pl.col("name").str.contains(EXCLUDE))
        .filter(pl.col("price") >= MIN_APPLIANCE_PRICE)
        # El precio regular nunca puede ser menor al precio vigente
        .with_columns(pl.max_horizontal("regular_price", "price").alias("regular_price"))
        # Precio con tarjeta solo si es realmente menor al precio web
        .with_columns(
            pl.when(pl.col("card_price") < pl.col("price")).then(pl.col("card_price")).otherwise(None).alias("card_price")
        )
        .with_columns(
            pl.when(pl.col("card_price").is_null()).then(None).otherwise(pl.col("card_type")).alias("card_type"),
            pl.col("price").round(0).cast(pl.Int64),
            pl.col("regular_price").round(0).cast(pl.Int64),
            pl.col("card_price").round(0).cast(pl.Int64),
        )
        .with_columns(
            ((1 - pl.col("price") / pl.col("regular_price")) * 100).round(1).alias("discount_pct"),
            model_expr(),
            pl.col("category").replace({"Lavadoras secadoras": "Lavadoras", "Nevecones": "Neveras"}),
        )
        # Un mismo SKU puede aparecer en varias categorías/páginas: conservar el más barato
        .sort("price")
        .unique(subset=["store", "sku"], keep="first", maintain_order=True)
        .sort(["category", "brand", "price"])
        .with_columns(pl.lit(scraped_at.isoformat(timespec="seconds")).alias("scraped_at"))
    )
    return df.select([*FIELDS, "discount_pct", "model", "scraped_at"])
