// docs/js/finance.js
// Matemática financiera pura (sin DOM) para cálculo de créditos, cuotas y escenarios de compra.

/**
 * Fórmulas financieras exactas utilizadas:
 * - Tasa mensual vencida (TMV):
 *     i = (1 + TEA)^(1/12) − 1
 * - Cuota fija método francés (PMT):
 *     PMT = P · i / (1 − (1 + i)^−n)    [si i > 0]
 *     PMT = P / n                       [si i = 0]
 * - Tabla de amortización:
 *     interés_k = saldo_{k-1} · i
 *     capital_k = cuota − interés_k     [para k < n]
 *     capital_n = saldo_{n-1}           [para k = n, cierra saldo en 0 exactamente]
 *     saldo_k   = saldo_{k-1} − capital_k
 */

/**
 * Convierte TEA (%) a tasa mensual vencida decimal:
 * i = (1 + TEA)^(1/12) − 1
 * @param {number} teaPercent - Tasa efectiva anual en porcentaje (ej: 34.5 para 34.5%)
 * @returns {number} Tasa mensual vencida en forma decimal
 * @throws {RangeError} Si teaPercent no es un número finito o es <= -100
 */
export function teaToMonthly(teaPercent) {
  if (typeof teaPercent !== "number" || !Number.isFinite(teaPercent) || teaPercent <= -100) {
    throw new RangeError("TEA inválida: debe ser mayor a -100");
  }
  return Math.pow(1 + teaPercent / 100, 1 / 12) - 1;
}

/**
 * Calcula la cuota fija mensual según el sistema francés:
 * PMT = P · i / (1 − (1 + i)^−n)
 * Si i = 0, PMT = P / n.
 * @param {number} principal - Monto del crédito (capital P >= 0)
 * @param {number} monthlyRate - Tasa mensual vencida decimal (i >= 0)
 * @param {number} n - Número de cuotas (entero > 0)
 * @returns {number} Valor de la cuota periódica
 * @throws {RangeError} Si los parámetros están fuera de rango permitido
 */
export function pmt(principal, monthlyRate, n) {
  if (typeof principal !== "number" || !Number.isFinite(principal) || principal < 0) {
    throw new RangeError("Principal inválido: debe ser un número >= 0");
  }
  if (typeof monthlyRate !== "number" || !Number.isFinite(monthlyRate) || monthlyRate <= -1) {
    throw new RangeError("Tasa mensual inválida: debe ser mayor a -1");
  }
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError("n debe ser un entero > 0");
  }
  if (principal === 0) return 0;
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

/**
 * Genera la tabla de amortización para un crédito francés:
 * interés_k = saldo_{k-1} · i ; abono_k = cuota − interés_k
 * Asegura que Σ abonos = capital y saldo final 0 con tolerancia < 1e-6.
 * @param {number} principal - Monto inicial del crédito (P >= 0)
 * @param {number} teaPercent - Tasa efectiva anual en porcentaje
 * @param {number} n - Plazo en meses (entero > 0)
 * @returns {{monthlyRate: number, cuota: number, rows: Array<{k: number, cuota: number, interes: number, capital: number, saldo: number}>, totalPagado: number, totalIntereses: number}}
 */
export function amortization(principal, teaPercent, n) {
  if (typeof principal !== "number" || !Number.isFinite(principal) || principal < 0) {
    throw new RangeError("Principal inválido: debe ser un número >= 0");
  }
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError("n debe ser un entero > 0");
  }
  const i = teaToMonthly(teaPercent);
  const cuota = pmt(principal, i, n);
  const rows = [];
  let saldo = principal;

  for (let k = 1; k <= n; k++) {
    const interes = saldo * i;
    // El último abono salda exactamente el remanente para garantizar saldo final 0 y suma exacta de capital
    const capital = k === n ? saldo : cuota - interes;
    saldo = k === n ? 0 : saldo - capital;
    rows.push({
      k,
      cuota: k === n ? capital + interes : cuota,
      interes,
      capital,
      saldo,
    });
  }

  const totalPagado = rows.reduce((s, r) => s + r.cuota, 0);
  return {
    monthlyRate: i,
    cuota,
    rows,
    totalPagado,
    totalIntereses: totalPagado - principal,
  };
}

/**
 * Catálogo de medios de pago disponibles en la plataforma.
 * Cada medio define su etiqueta, tarjeta vinculada (si aplica), TEA por defecto y kind.
 */
export const PAYMENT_METHODS = {
  cmr:         { label: "Tarjeta CMR",                   cardType: "cmr",   defaultTea: 34.5, kind: "store-card" },
  exito:       { label: "Tarjeta Éxito",                 cardType: "exito", defaultTea: 34.5, kind: "store-card" },
  jumbo:       { label: "Tarjeta Jumbo Más",             cardType: "jumbo", defaultTea: 34.5, kind: "store-card" },
  credito:     { label: "Tarjeta de Crédito Tradicional", cardType: null,    defaultTea: 34.5, kind: "bank-card" },
  nu:          { label: "Tarjeta de Crédito Nu",          cardType: null,    defaultTea: 30.0, kind: "bank-card" },
  bancolombia: { label: "Tarjeta de Crédito Bancolombia", cardType: null,    defaultTea: 34.5, kind: "bank-card" },
  libre:       { label: "Crédito de Libre Inversión",    cardType: null,    defaultTea: 24.0, kind: "loan" },
};

/**
 * Determina el precio efectivo de un producto para un medio de pago dado.
 * El descuento de tarjeta SOLO aplica si el medio de pago coincide con card_type del producto.
 * @param {{price: number, card_price?: number|null, card_type?: string|null}} product
 * @param {string} methodKey - Clave en PAYMENT_METHODS
 * @returns {number} Precio a pagar por unidad
 */
export function effectivePrice(product, methodKey) {
  if (!product || typeof product !== "object") {
    throw new TypeError("Producto inválido");
  }
  const m = PAYMENT_METHODS[methodKey];
  if (m?.cardType && product.card_type === m.cardType && product.card_price != null) {
    return product.card_price;
  }
  return product.price;
}

/**
 * Escenario de un medio de pago: capital con descuentos + intereses para cada plazo.
 * @param {number} capital
 * @param {number} teaPercent
 * @param {number[]} terms
 * @returns {Array<{n: number, cuota: number, intereses: number, total: number}>}
 */
export function scenario(capital, teaPercent, terms = [12, 24, 36]) {
  return terms.map((n) => {
    const a = amortization(capital, teaPercent, n);
    return { n, cuota: a.cuota, intereses: a.totalIntereses, total: a.totalPagado };
  });
}

/**
 * Genera las opciones de financiación para múltiples métodos y plazos.
 * @param {object} params
 * @param {Record<string, number>} params.capitalByMethod - Capital a financiar por método (con descuentos aplicados)
 * @param {Record<string, number>} [params.teas] - TEA porcentual por método (opcional, fallback a defaultTea)
 * @param {number[]} [params.terms] - Plazos en meses a calcular (default [12, 24, 36])
 * @returns {Array<{methodKey: string, label: string, n: number, capital: number, tmv: number, cuota: number, intereses: number, total: number}>}
 */
export function financingOptions({ capitalByMethod, teas = {}, terms = [12, 24, 36] }) {
  if (!capitalByMethod || typeof capitalByMethod !== "object") {
    throw new TypeError("capitalByMethod debe ser un objeto");
  }
  if (!Array.isArray(terms)) {
    throw new TypeError("terms debe ser un array");
  }

  const results = [];
  for (const methodKey of Object.keys(capitalByMethod)) {
    const capital = capitalByMethod[methodKey];
    if (typeof capital !== "number" || !Number.isFinite(capital) || capital < 0) {
      throw new RangeError(`Capital inválido para método '${methodKey}'`);
    }

    const tea = teas?.[methodKey] ?? PAYMENT_METHODS[methodKey]?.defaultTea;
    if (tea == null || typeof tea !== "number" || !Number.isFinite(tea) || tea <= -100) {
      throw new RangeError(`TEA inválida para método '${methodKey}'`);
    }

    const tmv = teaToMonthly(tea);
    const label = PAYMENT_METHODS[methodKey]?.label ?? methodKey;

    for (const n of terms) {
      if (!Number.isInteger(n) || n <= 0) {
        throw new RangeError(`Plazo inválido: ${n}`);
      }
      const cuota = pmt(capital, tmv, n);
      const total = n * cuota;
      const intereses = total - capital;

      results.push({
        methodKey,
        label,
        n,
        capital,
        tmv,
        cuota,
        intereses,
        total,
      });
    }
  }

  return results;
}

/**
 * Recomienda la mejor, segunda mejor y peor opción de financiación para un plazo n dado.
 * Criterio: menor total; desempate por menor cuota.
 * Si hay < 2 opciones, savings = 0.
 * @param {Array<{methodKey: string, n: number, total: number, cuota: number, [k: string]: any}>} options
 * @param {number} [n] - Plazo en meses a filtrar
 * @returns {{best: any|null, second: any|null, worst: any|null, savingsVsSecond: number, savingsVsWorst: number}}
 */
export function recommend(options, n) {
  if (!Array.isArray(options)) {
    throw new TypeError("options debe ser un array");
  }
  if (n != null && (!Number.isInteger(n) || n <= 0)) {
    throw new RangeError("Plazo n debe ser un entero > 0");
  }

  const filtered = n != null ? options.filter((o) => o.n === n) : [...options];

  if (filtered.length === 0) {
    return {
      best: null,
      second: null,
      worst: null,
      savingsVsSecond: 0,
      savingsVsWorst: 0,
    };
  }

  const sorted = [...filtered].sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    return a.cuota - b.cuota;
  });

  if (sorted.length === 1) {
    return {
      best: sorted[0],
      second: null,
      worst: sorted[0],
      savingsVsSecond: 0,
      savingsVsWorst: 0,
    };
  }

  const best = sorted[0];
  const second = sorted[1];
  const worst = sorted[sorted.length - 1];

  return {
    best,
    second,
    worst,
    savingsVsSecond: second.total - best.total,
    savingsVsWorst: worst.total - best.total,
  };
}
