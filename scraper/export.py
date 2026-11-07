"""Exportación: data.json (para el frontend estático) y DuckDB (opcional)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import polars as pl


def to_json(df: pl.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": df.height,
        "stores": sorted(df["store"].unique().to_list()) if df.height else [],
        "categories": sorted(df["category"].unique().to_list()) if df.height else [],
        "products": df.to_dicts(),
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)  # escritura atómica: nunca queda un data.json a medias


def to_duckdb(df: pl.DataFrame, path: Path) -> None:
    import duckdb
    path.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(path))
    try:
        con.register("df_view", df.to_arrow())
        con.execute("CREATE OR REPLACE TABLE products AS SELECT * FROM df_view")
    finally:
        con.close()
