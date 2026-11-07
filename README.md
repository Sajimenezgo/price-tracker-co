# Price Tracker – Electrodomésticos Colombia

Comparador de precios de neveras, lavadoras y secadoras de **Éxito, Falabella y Jumbo**, con simulador financiero.
100 % estático: un scraper en Python genera `docs/data.json` cada noche y GitHub Pages sirve `docs/`.

```
scraper/        pipeline Python (APIs internas → Polars → JSON/DuckDB)
  stores/       vtex.py (Éxito, Jumbo) · falabella.py
  http_client.py reintentos + backoff + rotación de User-Agent/headers
  processing.py limpieza y normalización con Polars
  export.py     data.json (atómico) y DuckDB opcional
docs/           frontend (index.html + js/ + data.json)
.github/workflows/scrape.yml   cron diario 02:00 Colombia (07:00 UTC)
tests/          pytest (pipeline) · docs/js/finance.test.mjs (matemática financiera)
```

## Uso local
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scraper.main [--stores exito jumbo] [--duckdb]
python -m http.server -d docs 8000      # abrir http://localhost:8000
```

## Cómo se obtienen los datos (sin BeautifulSoup)
| Tienda | Endpoint | Notas |
|---|---|---|
| Éxito | `GET https://www.exito.com/api/catalog_system/pub/products/search/{categoria}?_from=0&_to=49` | VTEX Catalog API (JSON). Árbol de categorías: `/api/catalog_system/pub/category/tree/3` |
| Jumbo | `GET https://www.jumbocolombia.com/api/catalog_system/pub/products/search/{categoria}?_from=0&_to=49` | Igual (VTEX) |
| Falabella | `GET https://www.falabella.com.co/falabella-co/search?Ntt=nevera&page=N` | No se encontró una API JSON pura estable; se extrae con regex el JSON hidratado `__NEXT_DATA__` (no hay parser HTML). Si Falabella bloquea las IPs de GitHub Actions, la tienda se omite y se conservan sus datos anteriores. |

**Precio con tarjeta**
- Falabella: `prices[type=cmrPrice]` (tarjeta CMR).
- Éxito/Jumbo: *teasers* VTEX restringidos a BINs de tarjeta (`RestrictionsBins`). Se aplica `PercentualDiscount` sobre `Price`, o `ListPrice − PromotionalPriceTableItemsDiscount`. **Es una heurística**: valida contra el sitio antes de confiar en el valor; el BIN exacto de cada tarjeta no se distingue.

## Descubrir endpoints con DevTools
1. Abre la categoría en Chrome → `F12` → pestaña **Network** → filtro **Fetch/XHR**; marca *Preserve log*.
2. Recarga y haz scroll/cambia de página para disparar la paginación.
3. Busca peticiones que devuelvan JSON con productos (`products/search`, `graphql`, `browse`, `listing`). Revisa **Preview** para ver la estructura y **Headers** para método, query params y headers requeridos.
4. Clic derecho → *Copy as cURL*, pruébalo en terminal quitando cookies/headers hasta dejar el mínimo.
5. Identifica la paginación (`_from/_to`, `page`, `cursor`) y los límites (VTEX: máx. 50 por página y 2500 en total).
6. Si la página no hace XHR (SSR), busca `<script id="__NEXT_DATA__">` en *Elements*/*View source*: ahí está el JSON.
7. Revisa `robots.txt` y los términos de uso; mantén ritmo bajo de peticiones.

## Despliegue
Settings → Pages → *Deploy from a branch* → `main` / `/docs`.
