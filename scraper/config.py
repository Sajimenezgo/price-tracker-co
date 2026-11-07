"""Configuración central: categorías, rutas de salida, parámetros de resiliencia."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "docs"
DATA_JSON = OUTPUT_DIR / "data.json"
DATA_DUCKDB = OUTPUT_DIR / "data.duckdb"

# Resiliencia
MAX_RETRIES = 5
BACKOFF_BASE = 1.5          # segundos; espera = base * 2**intento + jitter
REQUEST_TIMEOUT = 30
MIN_DELAY, MAX_DELAY = 0.6, 1.8   # pausa aleatoria entre peticiones
VTEX_PAGE_SIZE = 50         # VTEX limita _to - _from <= 49
VTEX_MAX_ITEMS = 2500       # VTEX no pagina más allá de 2500 resultados
FALABELLA_MAX_PAGES = 30

# Categoría lógica -> ruta de categoría VTEX (descubierta en /api/catalog_system/pub/category/tree/3)
EXITO_CATEGORIES = {
    "Neveras": "electrodomesticos/refrigeracion/neveras",
    "Lavadoras": "electrodomesticos/lavado-y-secado/lavadoras",
    "Lavadoras secadoras": "electrodomesticos/lavado-y-secado/lavadoras-secadoras",
}
JUMBO_CATEGORIES = {
    "Neveras": "electrodomesticos/refrigeracion/neveras",
    "Lavadoras": "electrodomesticos/lavadoras-y-secadoras/lavadoras",
    "Secadoras": "electrodomesticos/lavadoras-y-secadoras/secadoras",
}
# Falabella: términos de búsqueda (el listado SSR devuelve JSON hidratado de Next.js)
FALABELLA_QUERIES = {
    "Neveras": "nevera",
    "Nevecones": "nevecon",
    "Lavadoras": "lavadora",
    "Secadoras": "secadora",
}
