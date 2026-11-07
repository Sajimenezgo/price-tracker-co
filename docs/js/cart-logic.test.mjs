import assert from "node:assert/strict";
import {
  DEFAULT_SHIPPING,
  shippingFor,
  buildCartScenarios,
} from "./cart-logic.js";
import { effectivePrice } from "./finance.js";

/* ==========================================================================
   1. Reglas de Envío y Umbral de Envío Gratis (shippingFor)
   ========================================================================== */
const rule = { fee: 19900, freeFrom: 150000 };

// Subtotal 0 -> flete 0
assert.equal(shippingFor(0, rule), 0);

// Justo debajo del umbral -> cobra flete
assert.equal(shippingFor(149999, rule), 19900);

// En el umbral exacto -> flete gratis (0)
assert.equal(shippingFor(150000, rule), 0);

// Por encima del umbral -> flete gratis (0)
assert.equal(shippingFor(200000, rule), 0);

// Regla sin umbral de envío gratis (freeFrom no definido o null)
assert.equal(shippingFor(500000, { fee: 15000 }), 15000);

// Validaciones de entrada
assert.throws(() => shippingFor(-10, rule), RangeError);
assert.throws(() => shippingFor(NaN, rule), RangeError);
assert.throws(() => shippingFor(100, null), RangeError);
assert.throws(() => shippingFor(100, { fee: -5000 }), RangeError);

/* ==========================================================================
   2. effectivePrice con tarjeta que coincide vs no coincide
   ========================================================================== */
const productCmr = {
  store: "falabella",
  sku: "SKU-CMR-1",
  name: "Televisor OLED 55",
  model: "TV-55-OLED",
  price: 2_000_000,
  card_price: 1_700_000,
  card_type: "cmr",
};

// Tarjeta coincide -> aplica card_price
assert.equal(effectivePrice(productCmr, "cmr"), 1_700_000);
// Tarjeta no coincide (otra tarjeta de tienda o bancaria) -> precio regular
assert.equal(effectivePrice(productCmr, "exito"), 2_000_000);
assert.equal(effectivePrice(productCmr, "nu"), 2_000_000);
assert.equal(effectivePrice(productCmr, "credito"), 2_000_000);

/* ==========================================================================
   3. Caso donde cruzar NO conviene por el flete extra
   ==========================================================================
   Ítem 1: Éxito $70.000, Falabella $65.000 (Falabella ahorra $5.000)
   Ítem 2: Éxito $90.000, Falabella $95.000 (Éxito ahorra $5.000)
   Comprando todo en Éxito: subtotal $160.000 >= 150.000 -> Flete $0 -> Total $160.000.
   Comprando todo en Falabella: subtotal $160.000 >= 150.000 -> Flete $0 -> Total $160.000.
   Cruzando (Ítem 1 en Falabella $65k + Ítem 2 en Éxito $90k):
     - Subtotal Falabella: $65.000 < $150.000 -> Flete $19.900
     - Subtotal Éxito: $90.000 < $150.000 -> Flete $19.900
     - Subtotal ítems: $155.000. Fletes: $39.800. Total cruzado: $194.800.
   El flete extra ($39.800) destruye el ahorro de $5.000 en producto.
   NO CONVIENE CRUZAR. best debe ser una sola tienda ('store:exito' o 'store:falabella').
   ========================================================================== */
const catalogNoCross = [
  { store: "exito", sku: "E1", model: "MOD-1", price: 70000, card_price: null, card_type: null },
  { store: "falabella", sku: "F1", model: "MOD-1", price: 65000, card_price: null, card_type: null },
  { store: "exito", sku: "E2", model: "MOD-2", price: 90000, card_price: null, card_type: null },
  { store: "falabella", sku: "F2", model: "MOD-2", price: 95000, card_price: null, card_type: null },
];

const itemsNoCross = [
  { key: "m:MOD-1", model: "MOD-1", sku: "E1", store: "exito", qty: 1, name: "Producto 1" },
  { key: "m:MOD-2", model: "MOD-2", sku: "E2", store: "exito", qty: 1, name: "Producto 2" },
];

const resNoCross = buildCartScenarios({
  items: itemsNoCross,
  products: catalogNoCross,
  methodKey: "credito",
  shipping: DEFAULT_SHIPPING,
});

assert.equal(resNoCross.perStore.exito.subtotal, 160000);
assert.equal(resNoCross.perStore.exito.shipping, 0);
assert.equal(resNoCross.perStore.exito.total, 160000);
assert.equal(resNoCross.perStore.exito.complete, true);

assert.equal(resNoCross.perStore.falabella.subtotal, 160000);
assert.equal(resNoCross.perStore.falabella.shipping, 0);
assert.equal(resNoCross.perStore.falabella.total, 160000);
assert.equal(resNoCross.perStore.falabella.complete, true);

// El mejor escenario elige una sola tienda por menor total / desempate
assert.ok(resNoCross.best.id === "store:exito" || resNoCross.best.id === "store:falabella");
assert.equal(resNoCross.best.total, 160000);
assert.notEqual(resNoCross.best.id, "cross");

/* ==========================================================================
   4. Caso donde SÍ conviene cruzar
   ==========================================================================
   Ítem 1: Éxito $300.000, Falabella $100.000
   Ítem 2: Éxito $100.000, Falabella $300.000
   Comprando todo en Éxito: subtotal $400.000 -> Flete $0 -> Total $400.000.
   Comprando todo en Falabella: subtotal $400.000 -> Flete $0 -> Total $400.000.
   Cruzando (Ítem 1 en Falabella $100k + Ítem 2 en Éxito $100k):
     - Subtotal Falabella: $100.000 < $150.000 -> Flete $19.900
     - Subtotal Éxito: $100.000 < $150.000 -> Flete $19.900
     - Total cruzado: $200.000 + $39.800 = $239.800.
   $239.800 < $400.000. Cruzar ahorra más de $160.000 COP.
   SÍ CONVIENE CRUZAR. best.id debe ser 'cross'.
   ========================================================================== */
const catalogCross = [
  { store: "exito", sku: "E10", model: "MOD-A", price: 300000, card_price: null, card_type: null },
  { store: "falabella", sku: "F10", model: "MOD-A", price: 100000, card_price: null, card_type: null },
  { store: "exito", sku: "E20", model: "MOD-B", price: 100000, card_price: null, card_type: null },
  { store: "falabella", sku: "F20", model: "MOD-B", price: 300000, card_price: null, card_type: null },
];

const itemsCross = [
  { key: "m:MOD-A", model: "MOD-A", sku: "E10", store: "exito", qty: 1, name: "Prod A" },
  { key: "m:MOD-B", model: "MOD-B", sku: "E20", store: "exito", qty: 1, name: "Prod B" },
];

const resCross = buildCartScenarios({
  items: itemsCross,
  products: catalogCross,
  methodKey: "credito",
  shipping: DEFAULT_SHIPPING,
});

assert.equal(resCross.perStore.exito.total, 400000);
assert.equal(resCross.perStore.falabella.total, 400000);

assert.equal(resCross.cross.subtotal, 200000);
assert.equal(resCross.cross.shipping, 39800);
assert.equal(resCross.cross.total, 239800);
assert.equal(resCross.cross.complete, true);
assert.equal(resCross.cross.storesUsed.length, 2);

assert.equal(resCross.best.id, "cross");
assert.equal(resCross.best.total, 239800);

/* ==========================================================================
   5. Ítem faltante en una tienda
   ==========================================================================
   Ítem 1 está en Éxito y Falabella.
   Ítem 2 es exclusivo de Falabella (sin modelo, sólo sku en Falabella).
   Éxito no puede completar el carrito (missing: [item2.key], complete: false).
   Falabella sí puede (complete: true).
   ========================================================================== */
const catalogMissing = [
  { store: "exito", sku: "E100", model: "MOD-X", price: 50000, card_price: null, card_type: null },
  { store: "falabella", sku: "F100", model: "MOD-X", price: 50000, card_price: null, card_type: null },
  { store: "falabella", sku: "F200", model: null, price: 80000, card_price: null, card_type: null },
];

const itemsMissing = [
  { key: "m:MOD-X", model: "MOD-X", sku: "E100", store: "exito", qty: 1, name: "Item X" },
  { key: "s:falabella:F200", model: null, sku: "F200", store: "falabella", qty: 1, name: "Item Y Exclusivo" },
];

const resMissing = buildCartScenarios({
  items: itemsMissing,
  products: catalogMissing,
  methodKey: "credito",
  shipping: DEFAULT_SHIPPING,
});

// Éxito le falta el ítem 2
assert.equal(resMissing.perStore.exito.complete, false);
assert.deepEqual(resMissing.perStore.exito.missing, ["s:falabella:F200"]);
assert.equal(resMissing.perStore.exito.subtotal, 50000);

// Falabella tiene ambos
assert.equal(resMissing.perStore.falabella.complete, true);
assert.deepEqual(resMissing.perStore.falabella.missing, []);
assert.equal(resMissing.perStore.falabella.subtotal, 130000);
assert.equal(resMissing.perStore.falabella.shipping, 19900); // 130k < 150k
assert.equal(resMissing.perStore.falabella.total, 149900);

// Jumbo no tiene ninguno
assert.equal(resMissing.perStore.jumbo.complete, false);
assert.equal(resMissing.perStore.jumbo.missing.length, 2);

// best debe ser Falabella
assert.equal(resMissing.best.id, "store:falabella");
assert.equal(resMissing.best.total, 149900);

/* ==========================================================================
   6. Descuento de Tarjeta influye en la tienda ganadora
   ========================================================================== */
const catalogCard = [
  { store: "exito", sku: "E_TV", model: "TV-4K", price: 1000000, card_price: 950000, card_type: "exito" },
  { store: "falabella", sku: "F_TV", model: "TV-4K", price: 1000000, card_price: 850000, card_type: "cmr" },
];

const itemsCard = [
  { key: "m:TV-4K", model: "TV-4K", sku: "E_TV", store: "exito", qty: 1, name: "TV 4K" },
];

// Con CMR gana Falabella ($850.000 vs $1.000.000)
const resCmr = buildCartScenarios({
  items: itemsCard,
  products: catalogCard,
  methodKey: "cmr",
  shipping: DEFAULT_SHIPPING,
});
assert.equal(resCmr.perStore.falabella.subtotal, 850000);
assert.equal(resCmr.perStore.exito.subtotal, 1000000);
assert.equal(resCmr.best.id, "store:falabella");

// Con Tarjeta Éxito gana Éxito ($950.000 vs $1.000.000)
const resExito = buildCartScenarios({
  items: itemsCard,
  products: catalogCard,
  methodKey: "exito",
  shipping: DEFAULT_SHIPPING,
});
assert.equal(resExito.perStore.exito.subtotal, 950000);
assert.equal(resExito.perStore.falabella.subtotal, 1000000);
assert.equal(resExito.best.id, "store:exito");

/* ==========================================================================
   7. Carrito Vacío
   ========================================================================== */
const resEmpty = buildCartScenarios({
  items: [],
  products: catalogCross,
  methodKey: "credito",
  shipping: DEFAULT_SHIPPING,
});
assert.equal(resEmpty.perStore.exito.total, 0);
assert.equal(resEmpty.cross.total, 0);
assert.equal(resEmpty.cross.complete, true);
assert.equal(resEmpty.best.id, "store:exito");
assert.equal(resEmpty.best.total, 0);

/* ==========================================================================
   8. Validaciones de Parámetros
   ========================================================================== */
assert.throws(() => buildCartScenarios({ items: null, products: [], methodKey: "cmr" }), TypeError);
assert.throws(() => buildCartScenarios({ items: [], products: "no-array", methodKey: "cmr" }), TypeError);
assert.throws(() => buildCartScenarios({ items: [], products: [], methodKey: 123 }), TypeError);
assert.throws(
  () =>
    buildCartScenarios({
      items: [{ key: "k1", sku: "s1", store: "exito", qty: -1 }],
      products: [],
      methodKey: "cmr",
    }),
  RangeError
);

console.log("cart-logic OK");
