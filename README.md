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

## Frontend (SPA estática)
La interfaz web es una Single Page Application (SPA) 100% estática basada en JavaScript moderno (ES Modules nativo) y Tailwind CSS vía CDN, sin empaquetadores ni dependencias externas pesadas:

- **`docs/index.html`**: Layout accesible con soporte para navegación por teclado, modo oscuro automático, diálogos modales accesibles (`role="dialog"`, trampa de foco, cierre con `Esc`) y diseño responsivo optimizado desde 360 px sin scroll horizontal.
- **`docs/js/app.js`**: Orquestador liviano que realiza la carga de `docs/data.json`, inicializa el estado y monta los componentes en el DOM.
- **`docs/js/state.js`**: Almacén reactivo centralizado basado en el patrón Pub/Sub con persistencia en `localStorage` (carrito, fletes por tienda y tasas personalizadas).
- **`docs/js/format.js`**: Sanitización estricta anti-XSS (`esc`, `safeUrl`) y formateo de moneda en pesos colombianos (`cop`).
- **`docs/js/components/catalog.js`**: Catálogo de productos con filtros combinados (tienda, categoría, marca, rango de precio, búsqueda en tiempo real, ordenación) y botón "Ver más".
- **`docs/js/components/cart.js`**: Carrito comparativo multi-tienda con gestión de cantidades, panel editable de fletes por tienda (`fee` y umbral `freeFrom` con advertencia de valores supuestos) y tarjetas de escenarios ("Todo en Éxito / Falabella / Jumbo" vs. "Compra cruzada óptima" indicando ítems faltantes, tiendas usadas y ahorro frente al segundo mejor).
- **`docs/js/components/payment-panel.js`**: Simulador de medios de pago (`PAYMENT_METHODS`) con TEA editable por método, base de compra seleccionable (mejor global, cruzada o tienda específica), cálculo de capital con descuentos de tarjeta (`card_price`), banner de opción más inteligente, selector de plazos (12, 24, 36), tabla de cuotas/TMV con fórmula visible y gráfica interactiva Capital vs. Intereses (`financing-chart.js`).
- **`docs/js/components/amortization-table.js`**: Tabla de amortización sistema francés (plazo 1–72 meses) con desglose de cuota fija, interés, abono y saldo final en cero.

### Ejecución de pruebas del frontend
```bash
node docs/js/finance.test.mjs
node docs/js/cart-logic.test.mjs
node docs/js/components/financing-chart.test.mjs
```

## Despliegue
Settings → Pages → *Deploy from a branch* → `main` / `/docs`.

## Estilos (Tailwind compilado)
El CSS se compila a `docs/styles.css` (sin CDN en runtime). Tras cambiar clases en `docs/**/*.{html,js}`:
```bash
npm install && npm run build:css   # y commitear docs/styles.css
npm test                           # tests de la lógica financiera y del carrito
```
