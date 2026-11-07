// docs/js/components/amortization-table.js
// Componente de tabla de amortización sistema francés (plazo 1-72 meses) accesible y reactivo.

import { state, getCartItems, setAmortizationTerm, subscribe } from "../state.js";
import { cop, esc } from "../format.js";
import { PAYMENT_METHODS, amortization } from "../finance.js";
import { calculateCapitalByMethod } from "./payment-panel.js";

/**
 * Inicializa el componente de tabla de amortización.
 * @param {HTMLElement} container
 */
export function initAmortizationTable(container) {
  if (!container) return;

  function ensureStructure() {
    if (container.querySelector("#inputAmortTerm")) return;

    container.innerHTML = `
      <details class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <summary class="cursor-pointer font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center justify-between select-none">
          <span class="flex items-center gap-2">
            <span>📊</span>
            <span>Tabla de amortización detallada (1 a 72 meses)</span>
          </span>
          <span class="text-xs text-indigo-600 dark:text-indigo-400 font-normal">Desplegar</span>
        </summary>

        <div class="mt-4 space-y-4">
          <!-- Barra de control: método activo y plazo configurable -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
              <span class="text-slate-500 dark:text-slate-400">Medio actual:</span>
              <strong id="amortMethodLabel" class="text-slate-900 dark:text-slate-100 font-semibold ml-1"></strong>
              <span id="amortTeaBadge" class="ml-1 text-[11px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono"></span>
            </div>

            <label class="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
              Plazo de amortización:
              <input
                type="number"
                min="1"
                max="72"
                value="${state.amortizationTerm}"
                id="inputAmortTerm"
                aria-label="Plazo de amortización en meses (1 a 72)"
                class="w-20 rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
              <span class="font-normal text-slate-500">meses</span>
            </label>
          </div>

          <!-- Tarjetas de métricas clave -->
          <div id="amortSummaryCards" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"></div>

          <!-- Tabla accesible con scroll y cabecera fija -->
          <div class="overflow-x-auto max-h-72 rounded-lg border border-slate-200 dark:border-slate-700">
            <table class="w-full text-xs text-right border-collapse" id="tableAmortization">
              <caption class="sr-only">Calendario mensual de pagos con desglose de cuota fija, interés, abono a capital y saldo final</caption>
              <thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 z-10">
                <tr>
                  <th scope="col" class="py-2 px-3 text-center">Mes (#)</th>
                  <th scope="col" class="py-2 px-3">Cuota mensual</th>
                  <th scope="col" class="py-2 px-3">Interés</th>
                  <th scope="col" class="py-2 px-3">Abono capital</th>
                  <th scope="col" class="py-2 px-3">Saldo remanente</th>
                </tr>
              </thead>
              <tbody id="amortTableBody" class="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900"></tbody>
            </table>
          </div>
        </div>
      </details>
    `;

    bindEvents();
  }

  function bindEvents() {
    const termInput = container.querySelector("#inputAmortTerm");
    if (termInput) {
      termInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        if (val && val >= 1 && val <= 72) {
          state.amortizationTerm = val;
          renderAmortization();
        }
      });

      termInput.addEventListener("change", (e) => {
        const val = Math.min(72, Math.max(1, parseInt(e.target.value, 10) || 12));
        termInput.value = val;
        setAmortizationTerm(val);
      });
    }
  }

  function renderAmortization() {
    const currentItems = getCartItems();
    if (currentItems.length === 0) {
      container.innerHTML = "";
      return;
    }

    ensureStructure();

    const termInput = container.querySelector("#inputAmortTerm");
    const methodLabel = container.querySelector("#amortMethodLabel");
    const teaBadge = container.querySelector("#amortTeaBadge");
    const summaryCards = container.querySelector("#amortSummaryCards");
    const tableBody = container.querySelector("#amortTableBody");

    const mKey = state.method;
    const m = PAYMENT_METHODS[mKey] || PAYMENT_METHODS.cmr;
    const tea = state.teas[mKey] ?? m.defaultTea;
    const term = Math.min(72, Math.max(1, state.amortizationTerm || 12));

    const capitalByMethod = calculateCapitalByMethod({
      items: currentItems,
      products: state.products,
      shipping: state.shipping,
      basis: state.basis,
    });

    const capital = capitalByMethod[mKey] ?? 0;
    const result = amortization(capital, tea, term);

    if (methodLabel) methodLabel.textContent = m.label;
    if (teaBadge) teaBadge.textContent = `TEA ${tea.toFixed(1)}% (TMV ${(result.monthlyRate * 100).toFixed(4)}%)`;

    if (termInput && document.activeElement !== termInput) {
      termInput.value = term;
    }

    if (summaryCards) {
      summaryCards.innerHTML = `
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/40">
          <div class="text-slate-500 dark:text-slate-400">Capital financiado</div>
          <div class="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">${cop(capital)}</div>
        </div>
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/40">
          <div class="text-slate-500 dark:text-slate-400">Cuota fija mensual</div>
          <div class="font-bold text-sm text-indigo-600 dark:text-indigo-400 mt-0.5">${cop(result.cuota)}</div>
        </div>
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/40">
          <div class="text-slate-500 dark:text-slate-400">Total intereses</div>
          <div class="font-bold text-sm text-amber-600 dark:text-amber-400 mt-0.5">${cop(result.totalIntereses)}</div>
        </div>
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/40">
          <div class="text-slate-500 dark:text-slate-400">Total a pagar (${term} m)</div>
          <div class="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">${cop(result.totalPagado)}</div>
        </div>
      `;
    }

    if (tableBody) {
      tableBody.innerHTML = result.rows.map((r) => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <td class="py-1.5 px-3 text-center text-slate-500 dark:text-slate-400 font-mono">${r.k}</td>
          <td class="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-100">${cop(r.cuota)}</td>
          <td class="py-1.5 px-3 text-amber-600 dark:text-amber-400">${cop(r.interes)}</td>
          <td class="py-1.5 px-3 text-indigo-600 dark:text-indigo-400">${cop(r.capital)}</td>
          <td class="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300">${cop(r.saldo)}</td>
        </tr>
      `).join("");
    }
  }

  subscribe((currentState, event) => {
    const t = event?.type;
    if (["cart", "shipping", "basis", "payment_method", "tea", "amortization_term", "init"].includes(t)) {
      renderAmortization();
    }
  });

  renderAmortization();
}
