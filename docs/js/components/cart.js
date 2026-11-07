// docs/js/components/cart.js
// Componente principal del carrito: gestión de ítems, fletes configurables y escenarios de compra.

import { state, getCartItems, updateCartQty, removeFromCart, updateShippingRule, resetShippingRules, subscribe } from "../state.js";
import { cop, esc, formatStore, STORE_NAMES } from "../format.js";
import { buildCartScenarios } from "../cart-logic.js";
import { PAYMENT_METHODS } from "../finance.js";

/**
 * Renderiza el listado de ítems en el carrito.
 * @param {Array<object>} items
 * @returns {string}
 */
function renderItemsListHtml(items) {
  if (items.length === 0) {
    return `
      <div class="py-8 text-center text-slate-500 dark:text-slate-400">
        <p class="text-base font-medium">El carrito está vacío.</p>
        <p class="text-xs mt-1">Agrega productos del catálogo para comparar precios y simular cuotas.</p>
      </div>
    `;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
          Productos en el carrito (${items.reduce((sum, i) => sum + (i.qty || 1), 0)})
        </h3>
      </div>
      <ul class="divide-y divide-slate-200 dark:divide-slate-700 border-y border-slate-200 dark:border-slate-700" role="list">
        ${items.map((item) => `
          <li class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-item-key="${esc(item.key)}">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-sm text-slate-900 dark:text-slate-100 break-words">${esc(item.name)}</span>
                ${item.model ? `<span class="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono">Mod: ${esc(item.model)}</span>` : ""}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tienda de origen: <span class="font-medium">${esc(formatStore(item.store))}</span> (SKU: ${esc(item.sku)})
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <label class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                Cant:
                <input
                  type="number"
                  min="1"
                  max="99"
                  value="${item.qty || 1}"
                  data-qty-key="${esc(item.key)}"
                  aria-label="Cantidad para ${esc(item.name)}"
                  class="w-16 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm text-right bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
              </label>
              <button
                type="button"
                data-rm-key="${esc(item.key)}"
                aria-label="Quitar ${esc(item.name)} del carrito"
                class="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                Quitar
              </button>
            </div>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

/**
 * Renderiza el panel de configuración de fletes por tienda.
 * @param {Record<string, {fee: number, freeFrom?: number}>} shipping
 * @returns {string}
 */
function renderShippingPanelHtml(shipping) {
  const storeKeys = Object.keys(STORE_NAMES);

  return `
    <details class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4">
      <summary class="cursor-pointer font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center justify-between select-none">
        <span class="flex items-center gap-2">
          <span>🚚</span>
          <span>Configuración de fletes por tienda</span>
        </span>
        <span class="text-xs text-indigo-600 dark:text-indigo-400 font-normal">Editar tarifas</span>
      </summary>

      <div class="mt-3 space-y-3">
        <div class="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800" role="note">
          ⚠️ <strong>Valores supuestos, ajústalos</strong> según la dirección de entrega y políticas vigentes de cada tienda.
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          ${storeKeys.map((s) => {
            const rule = shipping[s] || { fee: 19900, freeFrom: 150000 };
            return `
              <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2">
                <div class="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                  <span>${esc(formatStore(s))}</span>
                </div>
                <label class="block">
                  <span class="text-slate-500 dark:text-slate-400">Tarifa de flete ($):</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value="${rule.fee}"
                    data-ship-fee="${esc(s)}"
                    class="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                </label>
                <label class="block">
                  <span class="text-slate-500 dark:text-slate-400">Gratis desde ($):</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value="${rule.freeFrom ?? 0}"
                    data-ship-freefrom="${esc(s)}"
                    class="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                </label>
              </div>
            `;
          }).join("")}
        </div>

        <div class="flex justify-end pt-1">
          <button
            type="button"
            id="btnResetShipping"
            class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
          >
            Restablecer fletes por defecto
          </button>
        </div>
      </div>
    </details>
  `;
}

/**
 * Renderiza las tarjetas de escenarios comparativos de compra.
 * @param {object} params
 * @returns {string}
 */
export function renderScenariosHtml({ items, products, methodKey, shipping }) {
  if (items.length === 0) return "";

  const scenarios = buildCartScenarios({
    items,
    products,
    methodKey,
    shipping,
  });

  const storeKeys = Object.keys(STORE_NAMES);

  // Recolectar escenarios completos para calcular el ahorro frente a la 2ª mejor opción
  const completeList = [];
  for (const s of storeKeys) {
    if (scenarios.perStore[s]?.complete) {
      completeList.push({
        id: `store:${s}`,
        label: `Todo en ${formatStore(s)}`,
        total: scenarios.perStore[s].total,
      });
    }
  }

  if (scenarios.cross?.complete) {
    completeList.push({
      id: "cross",
      label: "Compra cruzada óptima",
      total: scenarios.cross.total,
    });
  }

  // Ordenar por total ascendente
  completeList.sort((a, b) => a.total - b.total);
  const bestScenario = completeList[0] || null;
  const secondBestScenario = completeList[1] || null;
  const savingsVsSecond = (bestScenario && secondBestScenario)
    ? Math.max(0, secondBestScenario.total - bestScenario.total)
    : 0;

  // 1. Tarjetas por tienda
  const storeCardsHtml = storeKeys.map((s) => {
    const data = scenarios.perStore[s];
    if (!data) return "";

    const isBest = bestScenario && bestScenario.id === `store:${s}`;
    const cardBorder = isBest
      ? "border-2 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm"
      : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800";

    const missingItems = (data.missing || []).map((key) => {
      const item = items.find((i) => i.key === key);
      return item ? `${item.name}${item.model ? ` (${item.model})` : ""}` : key;
    });

    return `
      <div class="rounded-xl ${cardBorder} p-4 flex flex-col justify-between space-y-3">
        <div>
          <div class="flex items-center justify-between gap-1 flex-wrap mb-1">
            <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">Todo en un solo flete</span>
            ${isBest ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">★ Mejor opción</span>` : ""}
          </div>
          <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">${esc(formatStore(s))}</h4>

          <div class="mt-3 space-y-1 text-xs">
            <div class="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal:</span>
              <span class="font-medium text-slate-900 dark:text-slate-100">${cop(data.subtotal)}</span>
            </div>
            <div class="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Flete (${esc(formatStore(s))}):</span>
              <span class="font-medium text-slate-900 dark:text-slate-100">${data.shipping === 0 ? "Gratis" : cop(data.shipping)}</span>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-slate-700">
          <div class="flex justify-between items-baseline">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">Total:</span>
            <span class="text-lg font-extrabold ${isBest ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}">
              ${cop(data.total)}
            </span>
          </div>

          ${isBest && savingsVsSecond > 0 ? `
            <div class="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40 rounded p-1.5 text-center">
              Ahorras ${cop(savingsVsSecond)} vs. la 2.ª mejor (${esc(secondBestScenario.label)})
            </div>
          ` : ""}

          ${!data.complete ? `
            <div class="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded p-2 space-y-1">
              <div class="font-semibold">⚠️ Faltan ${missingItems.length} ítem(s) en esta tienda:</div>
              <ul class="list-disc list-inside text-[11px] space-y-0.5">
                ${missingItems.map((m) => `<li class="truncate" title="${esc(m)}">${esc(m)}</li>`).join("")}
              </ul>
              <div class="text-[10px] text-amber-600 dark:text-amber-400 italic">No califica como mejor opción.</div>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  // 2. Tarjeta de compra cruzada óptima
  const cross = scenarios.cross;
  const isCrossBest = bestScenario && bestScenario.id === "cross";
  const crossBorder = isCrossBest
    ? "border-2 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm"
    : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800";

  const crossPicksHtml = (cross?.picks || []).map((pick) => {
    const item = items.find((i) => i.key === pick.key);
    const itemName = item ? item.name : pick.key;
    return `
      <li class="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
        <span class="truncate flex-1" title="${esc(itemName)}">${esc(itemName)}</span>
        <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium shrink-0">
          ${esc(formatStore(pick.store))}
        </span>
        <span class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
          ${cop(pick.unitPrice)}${pick.qty > 1 ? ` × ${pick.qty}` : ""}
        </span>
      </li>
    `;
  }).join("");

  const crossCardHtml = `
    <div class="col-span-full rounded-xl ${crossBorder} p-4 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">Optimización algorítmica</span>
            ${isCrossBest ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">★ Mejor opción</span>` : ""}
          </div>
          <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
            Compra cruzada óptima (lo más barato de cada tienda)
          </h4>
        </div>
        <div class="text-left sm:text-right">
          <div class="text-xs text-slate-500 dark:text-slate-400">Total compra cruzada</div>
          <div class="text-xl font-extrabold ${isCrossBest ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}">
            ${cop(cross.total)}
          </div>
          ${isCrossBest && savingsVsSecond > 0 ? `
            <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              Ahorras ${cop(savingsVsSecond)} vs. la 2.ª mejor (${esc(secondBestScenario.label)})
            </div>
          ` : ""}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-300 mb-2">Desglose de productos seleccionados:</div>
          <ul class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-2 space-y-0.5 max-h-48 overflow-y-auto">
            ${crossPicksHtml}
          </ul>
        </div>
        <div class="space-y-2">
          <div class="font-semibold text-slate-700 dark:text-slate-300">Resumen logístico:</div>
          <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-3 space-y-1.5">
            <div class="flex justify-between">
              <span class="text-slate-500 dark:text-slate-400">Tiendas involucradas:</span>
              <span class="font-medium text-slate-900 dark:text-slate-100">
                ${cross.storesUsed.map(formatStore).join(", ") || "Ninguna"}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 dark:text-slate-400">Subtotal artículos:</span>
              <span class="font-medium text-slate-900 dark:text-slate-100">${cop(cross.subtotal)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 dark:text-slate-400">Flete total acumulado:</span>
              <span class="font-medium text-slate-900 dark:text-slate-100">${cop(cross.shipping)}</span>
            </div>
          </div>
          ${!cross.complete ? `
            <div class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded p-2">
              ⚠️ La compra cruzada no pudo cubrir todos los artículos de la lista.
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
          Comparativo de escenarios de compra
        </h3>
        <span class="text-xs text-slate-500 dark:text-slate-400">
          Precios según medio actual: <strong>${esc(PAYMENT_METHODS[methodKey]?.label || methodKey)}</strong>
        </span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        ${storeCardsHtml}
        ${crossCardHtml}
      </div>
    </div>
  `;
}

/**
 * Inicializa el componente de carrito dentro de su contenedor raíz.
 * @param {HTMLElement} container
 */
export function initCart(container) {
  if (!container) return;

  container.innerHTML = `
    <div id="cartItemsContainer" class="space-y-4"></div>
    <div id="cartShippingContainer" class="pt-2"></div>
    <div id="cartScenariosContainer" class="pt-2"></div>
  `;

  const itemsEl = container.querySelector("#cartItemsContainer");
  const shippingEl = container.querySelector("#cartShippingContainer");
  const scenariosEl = container.querySelector("#cartScenariosContainer");

  let shippingRendered = false;

  function updateItemsList() {
    const items = getCartItems();
    if (itemsEl) {
      itemsEl.innerHTML = renderItemsListHtml(items);
    }
  }

  function updateShippingPanel() {
    if (shippingEl) {
      shippingEl.innerHTML = renderShippingPanelHtml(state.shipping);
      shippingRendered = true;
    }
  }

  function updateScenarios() {
    const items = getCartItems();
    if (scenariosEl) {
      scenariosEl.innerHTML = renderScenariosHtml({
        items,
        products: state.products,
        methodKey: state.method,
        shipping: state.shipping,
      });
    }
  }

  // 1. Delegación de eventos en items (Quitar y Cantidad)
  if (itemsEl) {
    itemsEl.addEventListener("click", (e) => {
      const rmBtn = e.target.closest("[data-rm-key]");
      if (rmBtn) {
        const key = rmBtn.getAttribute("data-rm-key");
        removeFromCart(key);
      }
    });

    itemsEl.addEventListener("change", (e) => {
      const qtyInput = e.target.closest("[data-qty-key]");
      if (qtyInput) {
        const key = qtyInput.getAttribute("data-qty-key");
        const val = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        qtyInput.value = val;
        updateCartQty(key, val);
      }
    });

    itemsEl.addEventListener("input", (e) => {
      const qtyInput = e.target.closest("[data-qty-key]");
      if (qtyInput && qtyInput.value) {
        const key = qtyInput.getAttribute("data-qty-key");
        const val = parseInt(qtyInput.value, 10);
        if (val && val >= 1) {
          updateCartQty(key, val);
        }
      }
    });
  }

  // 2. Delegación de eventos en fletes (sin re-renderizar los inputs mientras se editan)
  if (shippingEl) {
    shippingEl.addEventListener("change", (e) => {
      const target = e.target;
      const feeStore = target.getAttribute("data-ship-fee");
      const freeStore = target.getAttribute("data-ship-freefrom");

      if (feeStore) {
        const feeVal = Math.max(0, parseFloat(target.value) || 0);
        updateShippingRule(feeStore, { fee: feeVal });
      } else if (freeStore) {
        const freeVal = Math.max(0, parseFloat(target.value) || 0);
        updateShippingRule(freeStore, { freeFrom: freeVal });
      }
    });

    shippingEl.addEventListener("input", (e) => {
      const target = e.target;
      const feeStore = target.getAttribute("data-ship-fee");
      const freeStore = target.getAttribute("data-ship-freefrom");

      if (feeStore) {
        const feeVal = Math.max(0, parseFloat(target.value) || 0);
        updateShippingRule(feeStore, { fee: feeVal });
      } else if (freeStore) {
        const freeVal = Math.max(0, parseFloat(target.value) || 0);
        updateShippingRule(freeStore, { freeFrom: freeVal });
      }
    });

    shippingEl.addEventListener("click", (e) => {
      if (e.target.id === "btnResetShipping") {
        resetShippingRules();
        updateShippingPanel();
      }
    });
  }

  // 3. Suscripción al estado centralizado
  subscribe((currentState, event) => {
    const t = event?.type;

    if (t === "cart") {
      // Si fue agregar, quitar o limpiar, actualizar la lista completa
      if (event.action !== "update_qty") {
        updateItemsList();
      }
      updateScenarios();
    } else if (t === "shipping") {
      // Si fue reset, refrescar panel de fletes
      if (event.reset) {
        updateShippingPanel();
      }
      updateScenarios();
    } else if (t === "payment_method" || t === "init") {
      updateScenarios();
    }
  });

  // Render inicial
  updateItemsList();
  updateShippingPanel();
  updateScenarios();
}
