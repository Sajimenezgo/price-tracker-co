// docs/js/components/payment-panel.js
// Panel de simulación de pagos, cálculo de capital por medio, tabs de plazo, gráfico comparativo y recomendación inteligente.

import { state, getCartItems, setPaymentMethod, setBasis, setTea, setSelectedPlazo, subscribe } from "../state.js";
import { cop, esc, formatStore, STORE_NAMES } from "../format.js";
import { buildCartScenarios } from "../cart-logic.js";
import { PAYMENT_METHODS, financingOptions, recommend, teaToMonthly } from "../finance.js";
import { renderPlazoTabs, renderFinancingChart, mergeEquivalent } from "./financing-chart.js";

/**
 * Calcula el capital financiado (subtotal + flete) para cada medio de pago disponible,
 * aplicando el escenario base seleccionado (mejor, cruzada o tienda específica).
 * @param {object} params
 * @param {Array<object>} params.items
 * @param {Array<object>} params.products
 * @param {Record<string, {fee: number, freeFrom?: number}>} params.shipping
 * @param {string} params.basis
 * @returns {Record<string, number>}
 */
export function calculateCapitalByMethod({ items, products, shipping, basis }) {
  const capitalByMethod = {};

  for (const methodKey of Object.keys(PAYMENT_METHODS)) {
    const scenarios = buildCartScenarios({
      items,
      products,
      methodKey,
      shipping,
    });

    let capital = 0;
    if (basis === "best") {
      if (scenarios.best) {
        capital = scenarios.best.total;
      } else {
        capital = scenarios.cross?.total || 0;
      }
    } else if (basis === "cross") {
      capital = scenarios.cross?.total || 0;
    } else if (scenarios.perStore[basis]) {
      capital = scenarios.perStore[basis].total;
    } else {
      capital = scenarios.cross?.total || 0;
    }

    capitalByMethod[methodKey] = capital;
  }

  return capitalByMethod;
}

/**
 * Describe dónde comprar para obtener el capital de cada medio de pago (la recomendación
 * "Tarjeta Éxito" solo es válida si se compra en Éxito: hay que decirlo).
 * @returns {Record<string, string>}
 */
export function purchasePlanByMethod({ items, products, shipping, basis }) {
  const plans = {};
  for (const methodKey of Object.keys(PAYMENT_METHODS)) {
    const sc = buildCartScenarios({ items, products, methodKey, shipping });
    let id = basis;
    if (basis === "best") id = sc.best?.id ?? "cross";
    if (id === "cross") {
      const used = sc.cross?.storesUsed ?? [];
      plans[methodKey] = used.length > 1 ? `compra cruzada (${used.map(formatStore).join(" + ")})` : `comprando en ${formatStore(used[0] ?? "")}`;
    } else {
      plans[methodKey] = `comprando en ${formatStore(id.replace(/^store:/, ""))}`;
    }
  }
  return plans;
}

/**
 * Genera el banner con la recomendación más inteligente.
 * @param {{best: any, second: any, savingsVsSecond: number}} rec
 * @param {number} n
 * @returns {string}
 */
function renderSmartBannerHtml(rec, n, plan = "") {
  if (!rec.best) return "";

  const best = rec.best;
  const savings = rec.savingsVsSecond;
  const second = rec.second;

  const savingsText = savings > 0 && second
    ? `, ahorras <strong>${cop(savings)}</strong> vs la 2.ª (${esc(second.label)})`
    : "";

  return `
    <div class="rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-indigo-500/15 border border-emerald-500/30 dark:border-emerald-500/40 p-4" role="region" aria-label="Recomendación inteligente">
      <div class="flex items-center gap-2">
        <span class="text-xl">✨</span>
        <h4 class="font-bold text-sm sm:text-base text-emerald-950 dark:text-emerald-200">
          Opción más inteligente a ${n} meses
        </h4>
      </div>
      <p class="mt-1.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
        Mejor: <strong>${esc(best.label)}</strong>${plan ? ` (${esc(plan)})` : ""} a <strong>${n} meses</strong>, total <strong>${cop(best.total)}</strong> (cuota: <strong>${cop(best.cuota)}/mes</strong>)${savingsText}.
      </p>
    </div>
  `;
}

/**
 * Renderiza la tabla resumen de cuotas por plazo (12/24/36), TEA editable y TMV.
 * @param {Array<object>} options
 * @param {Record<string, number>} capitalByMethod
 * @param {string} activeMethodKey
 * @returns {string}
 */
function renderRatesTableHtml(options, capitalByMethod, activeMethodKey) {
  const methodKeys = Object.keys(PAYMENT_METHODS);

  const optMap = {};
  for (const opt of options) {
    if (!optMap[opt.methodKey]) optMap[opt.methodKey] = {};
    optMap[opt.methodKey][opt.n] = opt;
  }

  return `
    <div class="space-y-2">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h4 class="text-sm font-bold text-slate-900 dark:text-slate-100">
          Resumen de cuotas y costos por medio de pago
        </h4>
        <span class="text-xs text-slate-500 dark:text-slate-400">
          Haz clic en un medio para ver su tabla de amortización
        </span>
      </div>

      <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table class="w-full text-xs text-left border-collapse" aria-label="Comparativo de cuotas y costos por método de pago">
          <thead class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th scope="col" class="py-2.5 px-3">Medio de pago</th>
              <th scope="col" class="py-2.5 px-2 text-center">TEA %</th>
              <th scope="col" class="py-2.5 px-2 text-center">TMV %</th>
              <th scope="col" class="py-2.5 px-3 text-right">Capital base</th>
              <th scope="col" class="py-2.5 px-3 text-right">12 meses (cuota/tot)</th>
              <th scope="col" class="py-2.5 px-3 text-right">24 meses (cuota/tot)</th>
              <th scope="col" class="py-2.5 px-3 text-right">36 meses (cuota/tot)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            ${methodKeys.map((k) => {
              const m = PAYMENT_METHODS[k];
              const isActive = k === activeMethodKey;
              const tea = state.teas[k] ?? m.defaultTea;
              const tmvPct = (teaToMonthly(tea) * 100).toFixed(4);
              const cap = capitalByMethod[k] ?? 0;
              const o12 = optMap[k]?.[12];
              const o24 = optMap[k]?.[24];
              const o36 = optMap[k]?.[36];

              const rowHighlight = isActive
                ? "bg-indigo-50/60 dark:bg-indigo-950/30 font-medium"
                : "hover:bg-slate-50 dark:hover:bg-slate-800/50";

              return `
                <tr class="${rowHighlight} transition-colors" data-method-row="${esc(k)}">
                  <th scope="row" class="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 cursor-pointer">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <input
                        type="radio"
                        name="activePaymentMethodRadio"
                        value="${esc(k)}"
                        ${isActive ? "checked" : ""}
                        aria-label="Seleccionar ${esc(m.label)}"
                        class="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      >
                      <span>${esc(m.label)}</span>
                      ${m.cardType ? `<span class="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">tarjeta ${esc(m.cardType)}</span>` : ""}
                    </div>
                  </th>
                  <td class="py-2 px-2 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value="${tea}"
                      data-tea-key="${esc(k)}"
                      aria-label="TEA porcentual para ${esc(m.label)}"
                      class="w-16 rounded border border-slate-300 dark:border-slate-600 px-1 py-0.5 text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                  </td>
                  <td class="py-2 px-2 text-center text-slate-600 dark:text-slate-400 font-mono">
                    <span data-tmv-display="${esc(k)}">${tmvPct}%</span>
                  </td>
                  <td class="py-2 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                    ${cop(cap)}
                  </td>
                  <td class="py-2 px-3 text-right">
                    ${o12 ? `<div>${cop(o12.cuota)}</div><div class="text-[10px] text-slate-400">${cop(o12.total)}</div>` : "—"}
                  </td>
                  <td class="py-2 px-3 text-right">
                    ${o24 ? `<div>${cop(o24.cuota)}</div><div class="text-[10px] text-slate-400">${cop(o24.total)}</div>` : "—"}
                  </td>
                  <td class="py-2 px-3 text-right">
                    ${o36 ? `<div>${cop(o36.cuota)}</div><div class="text-[10px] text-slate-400">${cop(o36.total)}</div>` : "—"}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 leading-normal pt-1">
        📐 <strong>Fórmulas financieras aplicadas:</strong> Tasa mensual vencida: <code class="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">i = (1 + TEA)^(1/12) − 1</code>. Cuota mensual fija (sistema francés): <code class="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">PMT = P · i / (1 − (1 + i)^−n)</code>. Ajusta la TEA según las condiciones de tu tarjeta o crédito.
      </p>
    </div>
  `;
}

/**
 * Inicializa el componente payment-panel en su contenedor.
 * @param {HTMLElement} container
 */
export function initPaymentPanel(container) {
  if (!container) return;

  function ensureStructure() {
    if (container.querySelector("#selectPaymentMethod")) return;

    container.innerHTML = `
      <div id="paymentContentWrapper" class="space-y-5 border-t border-slate-200 dark:border-slate-700 pt-5">
        <div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">
            Simulador financiero y comparativo de crédito
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Calcula cuotas mensuales, intereses totales y beneficios de tarjeta según el escenario base de compra.
          </p>
        </div>

        <!-- Controles de Base de Compra y Método Seleccionado -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label class="block font-semibold text-slate-700 dark:text-slate-300">
            Base de compra para simulación:
            <select
              id="selectBasis"
              class="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="best" ${state.basis === "best" ? "selected" : ""}>Mejor escenario global (menor costo)</option>
              <option value="cross" ${state.basis === "cross" ? "selected" : ""}>Compra cruzada óptima</option>
              ${Object.keys(STORE_NAMES).map((s) => `
                <option value="${esc(s)}" ${state.basis === s ? "selected" : ""}>Todo en ${esc(formatStore(s))}</option>
              `).join("")}
            </select>
          </label>

          <label class="block font-semibold text-slate-700 dark:text-slate-300">
            Medio de pago activo para amortización:
            <select
              id="selectPaymentMethod"
              class="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              ${Object.entries(PAYMENT_METHODS).map(([k, m]) => `
                <option value="${esc(k)}" ${state.method === k ? "selected" : ""}>
                  ${esc(m.label)} (TEA: ${state.teas[k]}%)
                </option>
              `).join("")}
            </select>
          </label>
        </div>

        <!-- Banner de Opción Inteligente -->
        <div id="smartBannerContainer"></div>

        <!-- Gráfica de financiamiento y Plazo Tabs -->
        <div class="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="font-bold text-sm text-slate-900 dark:text-slate-100">
              Comparativo de capital vs. intereses
            </div>
            <div id="plazoTabsContainer"></div>
          </div>
          <div id="financingChartContainer"></div>
        </div>

        <!-- Tabla de cuotas por plazo, TEA y TMV -->
        <div id="ratesTableContainer"></div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const basisSelect = container.querySelector("#selectBasis");
    const methodSelect = container.querySelector("#selectPaymentMethod");
    const tableContainer = container.querySelector("#ratesTableContainer");

    if (basisSelect) {
      basisSelect.addEventListener("change", (e) => {
        setBasis(e.target.value);
      });
    }

    if (methodSelect) {
      methodSelect.addEventListener("change", (e) => {
        setPaymentMethod(e.target.value);
      });
    }

    if (tableContainer) {
      tableContainer.addEventListener("change", (e) => {
        const teaKey = e.target.getAttribute("data-tea-key");
        const radio = e.target.closest("input[name='activePaymentMethodRadio']");

        if (teaKey) {
          const val = Math.max(0, parseFloat(e.target.value) || 0);
          setTea(teaKey, val);
        } else if (radio) {
          setPaymentMethod(radio.value);
        }
      });

      tableContainer.addEventListener("input", (e) => {
        const teaKey = e.target.getAttribute("data-tea-key");
        if (teaKey) {
          const val = parseFloat(e.target.value);
          if (!isNaN(val) && val >= 0) {
            state.teas[teaKey] = val;
            const tmvEl = tableContainer.querySelector(`[data-tmv-display="${teaKey}"]`);
            if (tmvEl) {
              tmvEl.textContent = `${(teaToMonthly(val) * 100).toFixed(4)}%`;
            }
            renderSimulation({ fullTable: false });
          }
        }
      });

      tableContainer.addEventListener("click", (e) => {
        const row = e.target.closest("[data-method-row]");
        if (row && !e.target.closest("input")) {
          const methodKey = row.getAttribute("data-method-row");
          if (methodKey) {
            setPaymentMethod(methodKey);
          }
        }
      });
    }
  }

  function renderSimulation({ fullTable = true } = {}) {
    const currentItems = getCartItems();
    if (currentItems.length === 0) {
      container.innerHTML = "";
      return;
    }

    ensureStructure();

    const bannerContainer = container.querySelector("#smartBannerContainer");
    const tabsContainer = container.querySelector("#plazoTabsContainer");
    const chartContainer = container.querySelector("#financingChartContainer");
    const tableContainer = container.querySelector("#ratesTableContainer");
    const basisSelect = container.querySelector("#selectBasis");
    const methodSelect = container.querySelector("#selectPaymentMethod");

    const capitalByMethod = calculateCapitalByMethod({
      items: currentItems,
      products: state.products,
      shipping: state.shipping,
      basis: state.basis,
    });

    const options = financingOptions({
      capitalByMethod,
      teas: state.teas,
      terms: [12, 24, 36],
    });

    const rec = recommend(options, state.selectedPlazo);

    if (bannerContainer) {
      const plans = purchasePlanByMethod({ items: currentItems, products: state.products, shipping: state.shipping, basis: state.basis });
      bannerContainer.innerHTML = renderSmartBannerHtml(rec, state.selectedPlazo, plans[rec.best?.methodKey]);
    }

    if (tabsContainer) {
      renderPlazoTabs(tabsContainer, [12, 24, 36], state.selectedPlazo, (newN) => {
        setSelectedPlazo(newN);
      });
    }

    if (chartContainer) {
      renderFinancingChart(chartContainer, mergeEquivalent(options, rec.best?.methodKey), {
        n: state.selectedPlazo,
        recommendedKey: rec.best?.methodKey,
        formatMoney: cop,
      });
    }

    if (fullTable && tableContainer) {
      tableContainer.innerHTML = renderRatesTableHtml(options, capitalByMethod, state.method);
    }

    if (basisSelect && document.activeElement !== basisSelect) {
      basisSelect.value = state.basis;
    }
    if (methodSelect && document.activeElement !== methodSelect) {
      methodSelect.value = state.method;
    }
  }

  subscribe((currentState, event) => {
    const t = event?.type;
    if (t === "cart" || t === "shipping" || t === "basis" || t === "init") {
      renderSimulation({ fullTable: true });
    } else if (t === "plazo") {
      renderSimulation({ fullTable: false });
    } else if (t === "tea") {
      if (document.activeElement?.getAttribute("data-tea-key") !== event.method) {
        renderSimulation({ fullTable: true });
      } else {
        renderSimulation({ fullTable: false });
      }
    } else if (t === "payment_method") {
      renderSimulation({ fullTable: true });
    }
  });

  renderSimulation({ fullTable: true });
}
