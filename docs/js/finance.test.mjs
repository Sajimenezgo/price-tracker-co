import assert from "node:assert/strict";
import { teaToMonthly, pmt, amortization, effectivePrice, scenario } from "./finance.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// 34.5% EA -> 2.5007% mensual aprox; (1+i)^12 debe devolver 1.345
const i = teaToMonthly(34.5);
close(Math.pow(1 + i, 12), 1.345, 1e-9);
close(i, 0.025007, 1e-6);
close(teaToMonthly(0), 0);

// PMT conocida: 10.000.000 a 12 meses con i=2% -> 945.595.99
close(pmt(10_000_000, 0.02, 12), 945_595.9, 0.1);
close(pmt(1200, 0, 12), 100);

// La tabla cierra en saldo 0 y el capital amortizado suma el principal
const a = amortization(5_000_000, 34.5, 24);
close(a.rows.at(-1).saldo, 0, 1e-6);
close(a.rows.reduce((s, r) => s + r.capital, 0), 5_000_000, 1e-4);
close(a.cuota * 24, a.totalPagado, 1);
assert.equal(a.rows.length, 24);

// Descuento solo si coincide el medio
const p = { price: 1000, card_price: 900, card_type: "cmr" };
assert.equal(effectivePrice(p, "cmr"), 900);
assert.equal(effectivePrice(p, "exito"), 1000);
assert.equal(effectivePrice(p, "credito"), 1000);

assert.equal(scenario(1e6, 24, [12, 24, 36]).length, 3);
console.log("finance OK");
