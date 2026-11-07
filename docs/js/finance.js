// Matemática financiera pura (sin DOM) para poder testearla con Node.

/** TEA (%) -> tasa mensual vencida (decimal): i_m = (1 + TEA)^(1/12) - 1 */
export function teaToMonthly(teaPercent) {
  if (!(teaPercent > -100)) throw new RangeError("TEA inválida");
  return Math.pow(1 + teaPercent / 100, 1 / 12) - 1;
}

/** Cuota fija sistema francés: PMT = P * i / (1 - (1+i)^-n). Si i = 0, P/n. */
export function pmt(principal, monthlyRate, n) {
  if (n <= 0) throw new RangeError("n debe ser > 0");
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

/** Tabla de amortización: interés_k = saldo_{k-1}*i ; abono_k = cuota - interés_k */
export function amortization(principal, teaPercent, n) {
  const i = teaToMonthly(teaPercent);
  const cuota = pmt(principal, i, n);
  const rows = [];
  let saldo = principal;
  for (let k = 1; k <= n; k++) {
    const interes = saldo * i;
    const capital = k === n ? saldo : cuota - interes; // el último abono cierra el saldo en 0 (evita residuos)
    saldo = k === n ? 0 : saldo - capital;
    rows.push({ k, cuota: k === n ? capital + interes : cuota, interes, capital, saldo });
  }
  const totalPagado = rows.reduce((s, r) => s + r.cuota, 0);
  return { monthlyRate: i, cuota, rows, totalPagado, totalIntereses: totalPagado - principal };
}

export const PAYMENT_METHODS = {
  cmr:     { label: "Tarjeta CMR",                   cardType: "cmr",   defaultTea: 34.5 },
  exito:   { label: "Tarjeta Éxito",                 cardType: "exito", defaultTea: 34.5 },
  jumbo:   { label: "Tarjeta Jumbo Más",             cardType: "jumbo", defaultTea: 34.5 },
  credito: { label: "Tarjeta de Crédito Tradicional", cardType: null,   defaultTea: 34.5 },
  libre:   { label: "Crédito de Libre Inversión",    cardType: null,    defaultTea: 24.0 },
};

/** El descuento de tarjeta SOLO aplica si el medio de pago coincide con card_type del producto. */
export function effectivePrice(product, methodKey) {
  const m = PAYMENT_METHODS[methodKey];
  if (m.cardType && product.card_type === m.cardType && product.card_price) return product.card_price;
  return product.price;
}

/** Escenario de un medio de pago: capital con descuentos + intereses para cada plazo. */
export function scenario(capital, teaPercent, terms = [12, 24, 36]) {
  return terms.map((n) => {
    const a = amortization(capital, teaPercent, n);
    return { n, cuota: a.cuota, intereses: a.totalIntereses, total: a.totalPagado };
  });
}
