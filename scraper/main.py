"""Orquestador: python -m scraper.main [--stores exito jumbo] [--duckdb]"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor

from . import config
from .export import to_duckdb, to_json
from .processing import build_dataframe, clean
from .stores import ALL_SCRAPERS

log = logging.getLogger("scraper")
MIN_ROWS_TO_PUBLISH = 50   # salvaguarda: no sobrescribir data.json con una corrida rota


def run_store(name: str) -> list[dict]:
    try:
        return ALL_SCRAPERS[name]().run()
    except Exception as exc:
        log.exception("Tienda %s falló por completo: %s", name, exc)
        return []


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stores", nargs="+", default=list(ALL_SCRAPERS), choices=list(ALL_SCRAPERS))
    ap.add_argument("--duckdb", action="store_true", help="exportar también docs/data.duckdb")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    with ThreadPoolExecutor(max_workers=len(args.stores)) as ex:   # una tienda por hilo
        results = list(ex.map(run_store, args.stores))
    rows = [r for chunk in results for r in chunk]
    df = clean(build_dataframe(rows))
    log.info("Total limpio: %d productos\n%s", df.height, df.group_by("store").len() if df.height else "")

    if df.height < MIN_ROWS_TO_PUBLISH:
        log.error("Solo %d filas (< %d): se conserva el data.json anterior.", df.height, MIN_ROWS_TO_PUBLISH)
        return 1

    # Si una tienda falló y antes tenía datos, conservar sus filas previas (degradación elegante)
    if config.DATA_JSON.exists():
        old = json.loads(config.DATA_JSON.read_text(encoding="utf-8"))["products"]
        missing = [s for s in args.stores if s not in set(df["store"].to_list())]
        if missing:
            import polars as pl
            log.warning("Sin datos nuevos para %s: se reutilizan los anteriores.", missing)
            keep = [r for r in old if r["store"] in missing]
            df = pl.concat([df, pl.DataFrame(keep, schema=df.schema)], how="vertical_relaxed")

    to_json(df, config.DATA_JSON)
    if args.duckdb:
        to_duckdb(df, config.DATA_DUCKDB)
    log.info("Escrito %s", config.DATA_JSON)
    return 0


if __name__ == "__main__":
    sys.exit(main())
