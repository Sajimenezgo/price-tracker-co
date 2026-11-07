// docs/js/components/catalog.js
// Componente de catálogo y filtros de búsqueda responsivo y accesible.

import { state, setFilter, loadMoreProducts, addToCart, subscribe } from "../state.js";
import { cop, esc, safeUrl, formatStore } from "../format.js";
import { PAYMENT_METHODS } from "../finance.js";

/**
 * Filtra y ordena la lista de productos según el estado actual.
 * @returns {Array<object>}
 */
export function getFilteredProducts() {
  const { q, stores, category, brand, min, max, sort } = state.filters;
  const term = q ? q.trim().toLowerCase() : "";

  const list = state.products.filter((p) => {
    if (stores.size > 0 && !stores.has(p.store)) return false;
    if (category && p.category !== category) return false;
    if (brand && p.brand !== brand) return false;
    if (min != null && p.price < min) return false;
    if (max != null && p.price > max) return false;
    if (term) {
      const matchName = p.name ? p.name.toLowerCase().includes(term) : false;
      const matchBrand = p.brand ? p.brand.toLowerCase().includes(term) : false;
      const matchModel = p.model ? p.model.toLowerCase().includes(term) : false;
      if (!matchName && !matchBrand && !matchModel) return false;
    }
    return true;
  });

  const isDesc = sort.startsWith("-");
  const key = sort.replace(/^-/, "");

  list.sort((a, b) => {
    if (key === "name") {
      return a.name.localeCompare(b.name);
    }
    const valA = a[key] ?? 0;
    const valB = b[key] ?? 0;
    return (valA - valB) * (isDesc ? -1 : 1);
  });

  return list;
}

/**
 * Renderiza la tarjeta individual de un producto.
 * @param {object} p
 * @returns {string}
 */
export function renderProductCard(p) {
  const storeLabel = formatStore(p.store);
  const cardMethod = p.card_type ? PAYMENT_METHODS[p.card_type] : null;
  const cardLabel = cardMethod?.label || "tarjeta vinculada";
  const addKey = `${p.store}:${p.sku}`;

  return `
    <article class="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
      <div>
        <div class="h-44 flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg overflow-hidden">
          <img
            loading="lazy"
            src="${safeUrl(p.image_url)}"
            alt="${esc(p.name)}"
            class="max-h-40 max-w-full object-contain"
            referrerpolicy="no-referrer"
          >
        </div>
        <div class="mt-3 flex items-center gap-2 flex-wrap text-xs">
          <span class="rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium px-2 py-0.5">${esc(storeLabel)}</span>
          <span class="text-slate-500 dark:text-slate-400 font-medium">${esc(p.brand)}</span>
          ${p.model ? `<span class="text-[11px] text-slate-400 dark:text-slate-500">Mod: ${esc(p.model)}</span>` : ""}
          ${p.discount_pct > 0 ? `<span class="ml-auto text-red-600 dark:text-red-400 font-bold">-${Math.round(p.discount_pct)}%</span>` : ""}
        </div>
        <h3 class="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2" title="${esc(p.name)}">
          ${esc(p.name)}
        </h3>
      </div>

      <div class="mt-4">
        <div class="mb-3">
          ${p.regular_price > p.price ? `<div class="text-xs line-through text-slate-400 dark:text-slate-500">${cop(p.regular_price)}</div>` : ""}
          <div class="text-xl font-bold text-slate-900 dark:text-slate-100">${cop(p.price)}</div>
          ${p.card_price ? `<div class="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">💳 ${cop(p.card_price)} con ${esc(cardLabel)}</div>` : ""}
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            data-add="${esc(addKey)}"
            class="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white py-2 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            Agregar
          </button>
          <a
            href="${safeUrl(p.product_url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
          >
            Ver
          </a>
        </div>
      </div>
    </article>
  `;
}

/**
 * Inicializa el componente de catálogo y enlaza los eventos con el estado centralizado.
 */
export function initCatalog({
  qInput,
  storesContainer,
  catSelect,
  brandSelect,
  minInput,
  maxInput,
  sortSelect,
  resultInfo,
  gridContainer,
  moreButton,
}) {
  // 1. Población inicial de filtros según state.products
  function populateFilterOptions() {
    if (storesContainer) {
      storesContainer.innerHTML = state.stores.map((s) => `
        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            value="${esc(s)}"
            class="storeFilterChk rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-700"
            ${state.filters.stores.has(s) ? "checked" : ""}
          >
          ${esc(formatStore(s))}
        </label>
      `).join("");
    }

    if (catSelect) {
      catSelect.innerHTML = `<option value="">Todas las categorías</option>` +
        state.categories.map((c) => `<option value="${esc(c)}" ${state.filters.category === c ? "selected" : ""}>${esc(c)}</option>`).join("");
    }

    if (brandSelect) {
      const brands = [...new Set(state.products.map((p) => p.brand).filter(Boolean))].sort();
      brandSelect.innerHTML = `<option value="">Todas las marcas</option>` +
        brands.map((b) => `<option value="${esc(b)}" ${state.filters.brand === b ? "selected" : ""}>${esc(b)}</option>`).join("");
    }
  }

  // 2. Renderizado del grid de productos
  function renderGrid() {
    const list = getFilteredProducts();
    const count = list.length;

    if (resultInfo) {
      resultInfo.textContent = `${count.toLocaleString("es-CO")} ${count === 1 ? "producto encontrado" : "productos encontrados"}`;
    }

    if (gridContainer) {
      if (count === 0) {
        gridContainer.innerHTML = `
          <div class="col-span-full py-12 text-center text-slate-500 dark:text-slate-400">
            No se encontraron productos con los filtros seleccionados.
          </div>
        `;
      } else {
        const visibleList = list.slice(0, state.catalogShown);
        gridContainer.innerHTML = visibleList.map(renderProductCard).join("");
      }
    }

    if (moreButton) {
      moreButton.classList.toggle("hidden", count <= state.catalogShown);
    }
  }

  // 3. Enlace de eventos de filtros
  if (qInput) {
    qInput.value = state.filters.q || "";
    qInput.addEventListener("input", (e) => {
      setFilter("q", e.target.value);
      renderGrid();
    });
  }

  if (storesContainer) {
    storesContainer.addEventListener("change", () => {
      const checked = [...storesContainer.querySelectorAll(".storeFilterChk:checked")].map((el) => el.value);
      setFilter("stores", new Set(checked));
      renderGrid();
    });
  }

  if (catSelect) {
    catSelect.addEventListener("change", (e) => {
      setFilter("category", e.target.value);
      renderGrid();
    });
  }

  if (brandSelect) {
    brandSelect.addEventListener("change", (e) => {
      setFilter("brand", e.target.value);
      renderGrid();
    });
  }

  if (minInput) {
    minInput.addEventListener("input", (e) => {
      const val = e.target.value ? Math.max(0, parseFloat(e.target.value) || 0) : null;
      setFilter("min", val);
      renderGrid();
    });
  }

  if (maxInput) {
    maxInput.addEventListener("input", (e) => {
      const val = e.target.value ? Math.max(0, parseFloat(e.target.value) || 0) : null;
      setFilter("max", val);
      renderGrid();
    });
  }

  if (sortSelect) {
    sortSelect.value = state.filters.sort;
    sortSelect.addEventListener("change", (e) => {
      setFilter("sort", e.target.value);
      renderGrid();
    });
  }

  if (moreButton) {
    moreButton.addEventListener("click", () => {
      loadMoreProducts();
      renderGrid();
    });
  }

  // 4. Delegación de eventos en el grid ("Agregar")
  if (gridContainer) {
    gridContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add]");
      if (!btn) return;
      const id = btn.getAttribute("data-add");
      const product = state.products.find((p) => `${p.store}:${p.sku}` === id);
      if (product) {
        addToCart(product);
        const originalText = btn.textContent;
        btn.textContent = "✓ Agregado";
        btn.classList.replace("bg-indigo-600", "bg-emerald-600");
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.replace("bg-emerald-600", "bg-indigo-600");
        }, 1200);
      }
    });
  }

  // 5. Suscripción a eventos de estado
  subscribe((currentState, event) => {
    if (event?.type === "init") {
      populateFilterOptions();
      renderGrid();
    } else if (event?.type === "pagination" || event?.type === "filters") {
      renderGrid();
    }
  });

  // Ejecución inicial
  populateFilterOptions();
  renderGrid();
}
