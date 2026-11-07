/**
 * financing-chart.js
 * Componente accesible y responsivo de gráfica Capital vs. Intereses (HTML/CSS + SVG inline).
 * No depende de librerías externas ni de docs/js/finance.js.
 */

/**
 * Escapa caracteres HTML para prevenir XSS.
 * @param {*} str
 * @returns {string}
 */
export function esc(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/**
 * Función pura y testeable sin DOM.
 * Filtra las opciones por plazo n, ordena por total ascendente y calcula los porcentajes y métricas relativas.
 *
 * @param {Array<{methodKey: string, label: string, n: number, capital: number, cuota?: number, intereses: number, total: number}>} options
 * @param {number} n - Plazo en meses
 * @param {string} [recommendedKey] - methodKey de la mejor opción recomendada
 * @returns {{ maxTotal: number, rows: Array<{ methodKey: string, label: string, capital: number, intereses: number, total: number, capitalPct: number, interesPct: number, widthPct: number, isBest: boolean, extraVsBest: number }> }}
 */
export function chartModel(options, n, recommendedKey) {
  const filtered = Array.isArray(options)
    ? options.filter((item) => item && Number(item.n) === Number(n))
    : [];

  if (filtered.length === 0) {
    return { maxTotal: 0, rows: [] };
  }

  // Ordenar por total ascendente (el primero es el más económico)
  const sorted = [...filtered].sort((a, b) => (Number(a.total) || 0) - (Number(b.total) || 0));

  const maxTotal = Math.max(0, ...sorted.map((r) => Number(r.total) || 0));

  // Determinar la mejor opción (por recommendedKey si existe en el conjunto, o la primera por total)
  const bestRow =
    (recommendedKey ? sorted.find((r) => r.methodKey === recommendedKey) : null) ||
    sorted[0];
  const mejorTotal = bestRow ? (Number(bestRow.total) || 0) : 0;

  const rows = sorted.map((row) => {
    const total = Number(row.total) || 0;
    const capital = Number(row.capital) || 0;
    const intereses = Number(row.intereses) || 0;

    const isBest = recommendedKey
      ? row.methodKey === recommendedKey
      : row === bestRow;

    // capitalPct e interesPct son el % del propio total y suman 100
    // Sin NaN ni división por cero
    let capitalPct = 0;
    let interesPct = 0;
    if (total > 0) {
      capitalPct = (capital / total) * 100;
      interesPct = 100 - capitalPct;
    } else {
      capitalPct = 100;
      interesPct = 0;
    }

    const widthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    const diff = total - mejorTotal;
    const extraVsBest = isBest || Math.abs(diff) < 1e-9 ? 0 : Math.max(0, diff);

    return {
      methodKey: row.methodKey,
      label: row.label,
      capital,
      intereses,
      total,
      capitalPct,
      interesPct,
      widthPct,
      isBest,
      extraVsBest,
    };
  });

  return { maxTotal, rows };
}

/**
 * Renderiza la gráfica de barras apiladas Capital vs. Intereses en container.innerHTML.
 *
 * @param {HTMLElement} container
 * @param {Array<object>} options
 * @param {{ n?: number, recommendedKey?: string, formatMoney?: (amount: number) => string }} [config]
 */
export function renderFinancingChart(container, options, { n = 12, recommendedKey, formatMoney } = {}) {
  if (!container) return;

  const fmt = typeof formatMoney === "function"
    ? formatMoney
    : (val) => new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(val ?? 0);

  const model = chartModel(options, n, recommendedKey);
  const safeN = esc(n);

  let contentHtml = "";

  if (model.rows.length === 0) {
    contentHtml = `
      <div class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No hay opciones de financiamiento disponibles para ${safeN} meses.
      </div>
    `;
  } else {
    const barsHtml = model.rows.map((row) => {
      const capPctStr = row.capitalPct.toFixed(1);
      const intPctStr = row.interesPct.toFixed(1);
      const ariaLabel = `${row.label}: total ${fmt(row.total)}, capital ${fmt(row.capital)} (${capPctStr}%), intereses ${fmt(row.intereses)} (${intPctStr}%)${row.isBest ? '. Opción más inteligente' : `, +${fmt(row.extraVsBest)} vs. la mejor`}`;

      const badgeOrExtra = row.isBest
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">★ Más inteligente</span>`
        : `<span class="text-xs font-medium text-slate-600 dark:text-slate-400">+${esc(fmt(row.extraVsBest))} vs. la mejor</span>`;

      // Ancho relativo al total máximo (mínimo 6% visual para que no desaparezca)
      const barWidth = model.maxTotal > 0 ? Math.max(row.widthPct, 6) : 0;

      return `
        <div class="space-y-1.5">
          <!-- Etiquetas superiores (arriba de la barra en pantallas pequeñas) -->
          <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 text-xs sm:text-sm">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-slate-900 dark:text-slate-100">${esc(row.label)}</span>
              ${badgeOrExtra}
            </div>
            <div class="font-bold text-slate-900 dark:text-slate-100 text-left sm:text-right shrink-0">
              ${esc(fmt(row.total))}
            </div>
          </div>

          <!-- Pista y barra apilada con role="img" y aria-label descriptivo -->
          <div class="w-full bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
            <div
              role="img"
              aria-label="${esc(ariaLabel)}"
              class="h-8 rounded-md flex overflow-hidden transition-all duration-300"
              style="width: ${barWidth.toFixed(2)}%; max-width: 100%;"
            >
              <!-- Segmento Capital (indigo sólido con contraste accesible) -->
              <div
                class="h-full bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center text-[11px] sm:text-xs font-medium px-1 overflow-hidden"
                style="width: ${row.capitalPct.toFixed(2)}%;"
                title="Capital: ${esc(fmt(row.capital))} (${capPctStr}%)"
              >
                ${row.capitalPct >= 22 ? `<span class="truncate">Cap: ${esc(fmt(row.capital))}</span>` : ''}
              </div>

              <!-- Segmento Intereses (ámbar con textura rayada accesible para daltonismo) -->
              ${row.intereses > 0 ? `
                <div
                  class="h-full bg-amber-500 text-slate-950 flex items-center justify-center text-[11px] sm:text-xs font-semibold px-1 overflow-hidden"
                  style="width: ${row.interesPct.toFixed(2)}%; background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0, 0, 0, 0.15) 5px, rgba(0, 0, 0, 0.15) 10px);"
                  title="Intereses: ${esc(fmt(row.intereses))} (${intPctStr}%)"
                >
                  ${row.interesPct >= 22 ? `<span class="truncate">Int: ${esc(fmt(row.intereses))}</span>` : ''}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Montos legibles detallados junto/debajo de la barra para móviles y pantallas pequeñas -->
          <div class="flex items-center justify-between text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 px-1 gap-2 flex-wrap">
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-500 shrink-0" aria-hidden="true"></span>
              <span>Capital: <strong class="text-slate-700 dark:text-slate-200 font-semibold">${esc(fmt(row.capital))}</strong> (${capPctStr}%)</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true"></span>
              <span>Intereses: <strong class="text-slate-700 dark:text-slate-200 font-semibold">${esc(fmt(row.intereses))}</strong> (${intPctStr}%)</span>
            </span>
          </div>
        </div>
      `;
    }).join("");

    const tableRowsHtml = model.rows.map((row) => `
      <tr class="${row.isBest ? 'bg-emerald-50/60 dark:bg-emerald-950/20 font-medium' : ''}">
        <th scope="row" class="py-2.5 pr-3 text-slate-900 dark:text-slate-100 font-medium">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span>${esc(row.label)}</span>
            ${row.isBest ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">Mejor</span>` : ''}
          </div>
        </th>
        <td class="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">${esc(fmt(row.capital))}</td>
        <td class="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">${esc(fmt(row.intereses))}</td>
        <td class="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">${esc(fmt(row.total))}</td>
        <td class="py-2.5 pl-3 text-right text-slate-600 dark:text-slate-400">
          ${row.isBest ? '<span class="text-emerald-700 dark:text-emerald-400 font-semibold">Mejor opción</span>' : `+${esc(fmt(row.extraVsBest))}`}
        </td>
      </tr>
    `).join("");

    const detailsTableHtml = `
      <details class="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs sm:text-sm">
        <summary class="cursor-pointer font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 py-1 select-none">
          Ver tabla detallada (accesible)
        </summary>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-left border-collapse" aria-label="Comparación detallada de financiamiento a ${safeN} meses">
            <caption class="sr-only">Desglose numérico de capital, intereses y total por cada medio a ${safeN} meses</caption>
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs uppercase tracking-wider">
                <th scope="col" class="py-2 pr-3 font-semibold">Método</th>
                <th scope="col" class="py-2 px-3 font-semibold text-right">Capital</th>
                <th scope="col" class="py-2 px-3 font-semibold text-right">Intereses</th>
                <th scope="col" class="py-2 px-3 font-semibold text-right">Total</th>
                <th scope="col" class="py-2 pl-3 font-semibold text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>
      </details>
    `;

    contentHtml = `
      <div class="space-y-4">
        ${barsHtml}
      </div>
      ${detailsTableHtml}
    `;
  }

  container.innerHTML = `
    <div class="w-full financing-chart-container">
      <!-- Encabezado con título y leyenda -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
          Capital vs. intereses a ${safeN} meses
        </h3>
        <div class="flex items-center gap-3 text-xs sm:text-sm font-medium" role="region" aria-label="Leyenda de la gráfica">
          <div class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span class="inline-block w-3.5 h-3.5 rounded-sm bg-indigo-600 dark:bg-indigo-500 border border-indigo-700 dark:border-indigo-400 shrink-0" aria-hidden="true"></span>
            <span>Capital <span class="text-[11px] text-slate-500 dark:text-slate-400 font-normal">(sólido)</span></span>
          </div>
          <div class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span class="inline-block w-3.5 h-3.5 rounded-sm bg-amber-500 border border-amber-600 shrink-0" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px);" aria-hidden="true"></span>
            <span>Intereses <span class="text-[11px] text-slate-500 dark:text-slate-400 font-normal">(rayado)</span></span>
          </div>
        </div>
      </div>

      ${contentHtml}
    </div>
  `;
}

/**
 * Renderiza botones segmentados 12/24/36 con aria-pressed y soporte onChange.
 *
 * @param {HTMLElement} container
 * @param {number[]} [plazos=[12, 24, 36]]
 * @param {number} [selected=12]
 * @param {(n: number) => void} onChange
 */
export function renderPlazoTabs(container, plazos = [12, 24, 36], selected = 12, onChange) {
  if (!container) return;

  const terms = Array.isArray(plazos) && plazos.length > 0 ? plazos : [12, 24, 36];
  const selectedNum = Number(selected) || terms[0];

  const buttonsHtml = terms.map((p) => {
    const isSelected = Number(p) === selectedNum;
    const baseClasses = "px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500";
    const stateClasses = isSelected
      ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm font-semibold"
      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50";

    return `
      <button
        type="button"
        class="${baseClasses} ${stateClasses}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
        data-plazo="${esc(p)}"
      >
        ${esc(p)} meses
      </button>
    `;
  }).join("");

  container.innerHTML = `
    <div class="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 gap-1" role="group" aria-label="Plazos de financiamiento">
      ${buttonsHtml}
    </div>
  `;

  if (typeof container.querySelectorAll === "function") {
    container.querySelectorAll("button[data-plazo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = Number(btn.getAttribute("data-plazo"));
        if (typeof onChange === "function") {
          onChange(p);
        }
      });
    });
  }
}
