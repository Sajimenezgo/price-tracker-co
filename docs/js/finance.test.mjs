import assert from "node:assert/strict";
import {
  teaToMonthly,
  pmt,
  amortization,
  effectivePrice,
  scenario,
  PAYMENT_METHODS,
  financingOptions,
  recommend,
} from "./finance.js";

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b} (diff: ${Math.abs(a - b)})`);

/* ---------------- 1. Conversión de Tasas (teaToMonthly) ---------------- */
// 34.5% EA -> 2.5007% mensual aprox; (1+i)^12 debe devolver 1.345
const i = teaToMonthly(34.5);
close(Math.pow(1 + i, 12), 1.345, 1e-9);
close(i, 0.025007, 1e-6);

// TEA 0% -> tasa mensual 0%
close(teaToMonthly(0), 0);

// Validaciones de rango
assert.throws(() => teaToMonthly(-100), RangeError);
assert.throws(() => teaToMonthly(-120), RangeError);

/* ---------------- 2. Cuota fija sistema francés (pmt) ---------------- */
// PMT conocida: 10.000.000 a 12 meses con i=2% -> 945.595.9
close(pmt(10_000_000, 0.02, 12), 945_595.9, 0.1);
// Con tasa 0%: cuota = capital / n
close(pmt(1200, 0, 12), 100);
close(pmt(0, 0.02, 12), 0);

// Validaciones
assert.throws(() => pmt(-100, 0.02, 12), RangeError);
assert.throws(() => pmt(1000, -1, 12), RangeError);
assert.throws(() => pmt(1000, 0.02, 0), RangeError);
assert.throws(() => pmt(1000, 0.02, -5), RangeError);

/* ---------------- 3. Tabla de Amortización (amortization) ---------------- */
const a = amortization(5_000_000, 34.5, 24);
close(a.rows.at(-1).saldo, 0, 1e-6);
close(a.rows.reduce((s, r) => s + r.capital, 0), 5_000_000, 1e-6);
close(a.cuota * 24, a.totalPagado, 1);
assert.equal(a.rows.length, 24);

// Precisión con n hasta 72 y TEA hasta 100%: Σ abonos = capital y saldo final = 0
for (const testTerms of [12, 24, 36, 48, 60, 72]) {
  for (const testTea of [0, 15.5, 34.5, 50, 100]) {
    const table = amortization(12_000_000, testTea, testTerms);
    const sumCapital = table.rows.reduce((acc, r) => acc + r.capital, 0);
    close(sumCapital, 12_000_000, 1e-6);
    close(table.rows.at(-1).saldo, 0, 1e-6);
  }
}

// Amortización con TEA 0%: intereses = 0 y saldo final 0
const aZero = amortization(600_000, 0, 6);
assert.equal(aZero.totalIntereses, 0);
assert.equal(aZero.totalPagado, 600_000);
assert.equal(aZero.cuota, 100_000);
for (const row of aZero.rows) {
  assert.equal(row.interes, 0);
  assert.equal(row.capital, 100_000);
}
assert.equal(aZero.rows.at(-1).saldo, 0);

/* ---------------- 4. PAYMENT_METHODS extendido ---------------- */
assert.ok(PAYMENT_METHODS.cmr);
assert.equal(PAYMENT_METHODS.cmr.kind, "store-card");
assert.equal(PAYMENT_METHODS.exito.kind, "store-card");
assert.equal(PAYMENT_METHODS.jumbo.kind, "store-card");
assert.equal(PAYMENT_METHODS.credito.kind, "bank-card");
assert.equal(PAYMENT_METHODS.libre.kind, "loan");

// Nuevos métodos: nu y bancolombia
assert.deepEqual(PAYMENT_METHODS.nu, {
  label: "Tarjeta de Crédito Nu",
  cardType: null,
  defaultTea: 30.0,
  kind: "bank-card",
});
assert.deepEqual(PAYMENT_METHODS.bancolombia, {
  label: "Tarjeta de Crédito Bancolombia",
  cardType: null,
  defaultTea: 34.5,
  kind: "bank-card",
});

/* ---------------- 5. effectivePrice ---------------- */
const prodCmr = { price: 1000, card_price: 900, card_type: "cmr" };
assert.equal(effectivePrice(prodCmr, "cmr"), 900); // Tarjeta coincide
assert.equal(effectivePrice(prodCmr, "exito"), 1000); // Tarjeta no coincide
assert.equal(effectivePrice(prodCmr, "credito"), 1000); // Tarjeta bancaria sin descuento
assert.equal(effectivePrice(prodCmr, "nu"), 1000);
assert.equal(effectivePrice(prodCmr, "bancolombia"), 1000);

const prodNoCard = { price: 2000, card_price: null, card_type: null };
assert.equal(effectivePrice(prodNoCard, "cmr"), 2000);

/* ---------------- 6. scenario ---------------- */
assert.equal(scenario(1e6, 24, [12, 24, 36]).length, 3);

/* ---------------- 7. financingOptions ---------------- */
const capitalByMethod = {
  cmr: 900_000,
  nu: 1_000_000,
  bancolombia: 1_000_000,
};

const opts = financingOptions({
  capitalByMethod,
  teas: { nu: 28.0 }, // sobreescritura de tea por defecto
  terms: [12, 24],
});

// 3 métodos * 2 plazos = 6 opciones
assert.equal(opts.length, 6);
for (const opt of opts) {
  assert.ok(opt.methodKey);
  assert.ok(opt.label);
  assert.ok(opt.n === 12 || opt.n === 24);
  assert.ok(opt.capital > 0);
  assert.ok(opt.tmv > 0);
  close(opt.total, opt.n * opt.cuota, 1e-6);
  close(opt.intereses, opt.total - opt.capital, 1e-6);
}

// Caso financingOptions con TEA 0%
const optsZero = financingOptions({
  capitalByMethod: { nu: 120_000 },
  teas: { nu: 0 },
  terms: [12],
});
assert.equal(optsZero[0].cuota, 10_000);
assert.equal(optsZero[0].intereses, 0);
assert.equal(optsZero[0].total, 120_000);

/* ---------------- 8. recommend ---------------- */
// Caso con varias opciones y filtro por n
const rec12 = recommend(opts, 12);
assert.ok(rec12.best);
assert.ok(rec12.second);
assert.ok(rec12.worst);
assert.ok(rec12.best.total <= rec12.second.total);
assert.ok(rec12.second.total <= rec12.worst.total);
close(rec12.savingsVsSecond, rec12.second.total - rec12.best.total, 1e-6);
close(rec12.savingsVsWorst, rec12.worst.total - rec12.best.total, 1e-6);

// Caso recommend con empate de total (desempate por menor cuota)
const tiedOptions = [
  { methodKey: "a", n: 12, total: 1000, cuota: 85 },
  { methodKey: "b", n: 12, total: 1000, cuota: 80 },
];
const recTie = recommend(tiedOptions, 12);
assert.equal(recTie.best.methodKey, "b"); // Menor cuota gana
assert.equal(recTie.second.methodKey, "a");
assert.equal(recTie.savingsVsSecond, 0);
assert.equal(recTie.savingsVsWorst, 0);

// Caso con < 2 opciones: savings = 0
const singleOpt = [{ methodKey: "solo", n: 12, total: 500, cuota: 50 }];
const recSingle = recommend(singleOpt, 12);
assert.equal(recSingle.best.methodKey, "solo");
assert.equal(recSingle.second, null);
assert.equal(recSingle.savingsVsSecond, 0);
assert.equal(recSingle.savingsVsWorst, 0);

// Caso sin opciones
const recEmpty = recommend([], 12);
assert.equal(recEmpty.best, null);
assert.equal(recEmpty.second, null);
assert.equal(recEmpty.worst, null);
assert.equal(recEmpty.savingsVsSecond, 0);
assert.equal(recEmpty.savingsVsWorst, 0);

console.log("finance OK");
