// docs/js/cart-logic.js
// Lógica pura de carritos, cálculo de fletes y escenarios óptimos de compra.

import { effectivePrice } from "./finance.js";

/**
 * Reglas de envío por defecto (supuestos editables, NO tarifas reales).
 */
export const DEFAULT_SHIPPING = {
  exito:     { fee: 19900, freeFrom: 150000 },
  falabella: { fee: 19900, freeFrom: 150000 },
  jumbo:     { fee: 19900, freeFrom: 150000 },
};

/**
 * Calcula el costo de flete para un subtotal y regla de tienda dados.
 * Retorna 0 si subtotal >= rule.freeFrom o subtotal == 0; si no rule.fee.
 * @param {number} subtotal - Monto acumulado de productos en la tienda
 * @param {{fee: number, freeFrom?: number}} rule - Parámetros de cobro de flete
 * @returns {number} Costo de envío a aplicar
 * @throws {RangeError} Si subtotal o rule.fee son valores no numéricos o negativos
 */
export function shippingFor(subtotal, rule) {
  if (typeof subtotal !== "number" || !Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError("Subtotal inválido: debe ser un número >= 0");
  }
  if (!rule || typeof rule !== "object" || typeof rule.fee !== "number" || !Number.isFinite(rule.fee) || rule.fee < 0) {
    throw new RangeError("Regla de envío inválida: debe contener fee >= 0");
  }
  if (subtotal === 0) return 0;
  if (rule.freeFrom != null && subtotal >= rule.freeFrom) return 0;
  return rule.fee;
}

/**
 * Encuentra el producto candidato con el menor effectivePrice en una tienda específica.
 * Criterio de coincidencia:
 * - p.store === store
 * - si item.model existe: p.model === item.model
 * - si no: p.sku === item.sku && p.store === item.store
 * @param {object} item - Ítem del carrito
 * @param {string} store - Tienda objetivo
 * @param {Array<object>} products - Catálogo de productos
 * @param {string} methodKey - Clave de medio de pago
 * @returns {{product: object, unitPrice: number}|null}
 */
function findBestCandidate(item, store, products, methodKey) {
  let bestCandidate = null;
  let minPrice = Infinity;

  for (const p of products) {
    if (p.store !== store) continue;

    const matches = item.model
      ? p.model === item.model
      : p.sku === item.sku && p.store === item.store;

    if (matches) {
      const price = effectivePrice(p, methodKey);
      if (price < minPrice) {
        minPrice = price;
        bestCandidate = p;
      }
    }
  }

  return bestCandidate ? { product: bestCandidate, unitPrice: minPrice } : null;
}

/**
 * Genera todos los subconjuntos no vacíos de un array (2^N - 1).
 * Para 3 tiendas genera exactamente 7 subconjuntos.
 * @param {string[]} arr
 * @returns {string[][]}
 */
function getNonEmptySubsets(arr) {
  const result = [];
  const n = arr.length;
  const count = 1 << n;
  for (let mask = 1; mask < count; mask++) {
    const subset = [];
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) {
        subset.push(arr[i]);
      }
    }
    result.push(subset);
  }
  return result;
}

/**
 * Construye los escenarios de compra para los ítems del carrito:
 * 1. Escenario por tienda individual (`perStore`)
 * 2. Escenario cruzado inteligente (`cross`) evaluando todos los subconjuntos de tiendas
 * 3. Mejor escenario global (`best`) priorizando menor total y desempate por tienda única
 *
 * @param {object} params
 * @param {Array<{key: string, model?: string|null, sku: string, store: string, qty?: number, name?: string}>} params.items
 * @param {Array<object>} params.products - Catálogo general de productos
 * @param {string} params.methodKey - Medio de pago seleccionado
 * @param {Record<string, {fee: number, freeFrom?: number}>} [params.shipping] - Reglas de envío
 * @returns {{
 *   perStore: Record<string, {subtotal: number, shipping: number, total: number, missing: string[], complete: boolean}>,
 *   cross: {subtotal: number, shipping: number, total: number, picks: Array<{key: string, store: string, unitPrice: number, qty: number}>, storesUsed: string[], complete: boolean},
 *   best: {id: string, total: number}|null
 * }}
 */
export function buildCartScenarios({ items, products, methodKey, shipping = DEFAULT_SHIPPING }) {
  if (!Array.isArray(items)) {
    throw new TypeError("items debe ser un array");
  }
  if (!Array.isArray(products)) {
    throw new TypeError("products debe ser un array");
  }
  if (typeof methodKey !== "string") {
    throw new TypeError("methodKey debe ser un string");
  }
  if (!shipping || typeof shipping !== "object") {
    throw new TypeError("shipping debe ser un objeto");
  }

  // Validar cantidades de ítems
  for (const item of items) {
    const qty = item.qty ?? 1;
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
      throw new RangeError(`Cantidad inválida para ítem ${item?.key ?? "desconocido"}`);
    }
  }

  const storeKeys = Object.keys(shipping);

  // 1. Escenarios por tienda individual
  const perStore = {};
  for (const s of storeKeys) {
    let subtotal = 0;
    const missing = [];

    for (const item of items) {
      const qty = item.qty ?? 1;
      const candidate = findBestCandidate(item, s, products, methodKey);
      if (candidate) {
        subtotal += candidate.unitPrice * qty;
      } else {
        missing.push(item.key);
      }
    }

    const complete = missing.length === 0;
    const rule = shipping[s] ?? { fee: 0, freeFrom: 0 };
    const shipCost = shippingFor(subtotal, rule);
    const total = subtotal + shipCost;

    perStore[s] = {
      subtotal,
      shipping: shipCost,
      total,
      missing,
      complete,
    };
  }

  // 2. Escenario cruzado inteligente
  // Prueba todos los subconjuntos no vacíos de tiendas (<= 3 tiendas => 7)
  const subsets = getNonEmptySubsets(storeKeys);
  const evaluatedSubsets = [];

  for (const subset of subsets) {
    const picks = [];
    let coversAll = true;

    for (const item of items) {
      const qty = item.qty ?? 1;
      let bestStoreForPick = null;
      let minPriceForPick = Infinity;

      for (const s of subset) {
        const cand = findBestCandidate(item, s, products, methodKey);
        if (cand && cand.unitPrice < minPriceForPick) {
          minPriceForPick = cand.unitPrice;
          bestStoreForPick = s;
        }
      }

      if (bestStoreForPick != null) {
        picks.push({
          key: item.key,
          store: bestStoreForPick,
          unitPrice: minPriceForPick,
          qty,
        });
      } else {
        coversAll = false;
      }
    }

    // Calcular costos por tienda usada
    const storeSubtotals = new Map();
    let subtotal = 0;
    for (const p of picks) {
      const lineCost = p.unitPrice * p.qty;
      subtotal += lineCost;
      storeSubtotals.set(p.store, (storeSubtotals.get(p.store) || 0) + lineCost);
    }

    const storesUsed = Array.from(storeSubtotals.keys());
    let shippingTotal = 0;
    for (const st of storesUsed) {
      const rule = shipping[st] ?? { fee: 0, freeFrom: 0 };
      const stSub = storeSubtotals.get(st) || 0;
      shippingTotal += shippingFor(stSub, rule);
    }

    const total = subtotal + shippingTotal;
    const complete = coversAll && picks.length === items.length;

    evaluatedSubsets.push({
      subset,
      picks,
      storesUsed,
      subtotal,
      shipping: shippingTotal,
      total,
      complete,
    });
  }

  // Selección del subconjunto para cross:
  // Si al menos un subconjunto cubre todo, solo los completos son válidos.
  // Si ninguno cubre todo, complete = false y se ignoran los ítems sin oferta.
  let eligibleSubsets = evaluatedSubsets.filter((es) => es.complete);
  let crossIsComplete = true;

  if (eligibleSubsets.length === 0) {
    crossIsComplete = false;
    // Si ninguno cubre todo, maximizar ítems cubiertos
    const maxPicks = Math.max(0, ...evaluatedSubsets.map((es) => es.picks.length));
    eligibleSubsets = evaluatedSubsets.filter((es) => es.picks.length === maxPicks);
  }

  // Ordenar para elegir el de menor total; desempate por menos tiendas usadas
  eligibleSubsets.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    if (a.storesUsed.length !== b.storesUsed.length) return a.storesUsed.length - b.storesUsed.length;
    return 0;
  });

  const bestSubsetResult = eligibleSubsets[0] ?? {
    picks: [],
    storesUsed: [],
    subtotal: 0,
    shipping: 0,
    total: 0,
    complete: items.length === 0,
  };

  const cross = {
    subtotal: bestSubsetResult.subtotal,
    shipping: bestSubsetResult.shipping,
    total: bestSubsetResult.total,
    picks: bestSubsetResult.picks,
    storesUsed: bestSubsetResult.storesUsed,
    complete: items.length === 0 ? true : crossIsComplete && bestSubsetResult.complete,
  };

  // 3. Mejor escenario global (best)
  // Menor total entre escenarios complete. Desempate: preferir una sola tienda.
  const completeScenarios = [];

  for (const s of storeKeys) {
    if (perStore[s]?.complete) {
      completeScenarios.push({
        id: `store:${s}`,
        total: perStore[s].total,
        isSingleStore: true,
      });
    }
  }

  if (cross.complete) {
    // Si cross utilizó solo 1 tienda, ya coincide con perStore de esa tienda
    const isSingle = cross.storesUsed.length <= 1;
    completeScenarios.push({
      id: isSingle && cross.storesUsed[0] ? `store:${cross.storesUsed[0]}` : "cross",
      total: cross.total,
      isSingleStore: isSingle,
    });
  }

  let best = null;
  if (completeScenarios.length > 0) {
    completeScenarios.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      // Desempate: preferir una sola tienda
      if (a.isSingleStore && !b.isSingleStore) return -1;
      if (!a.isSingleStore && b.isSingleStore) return 1;
      return 0;
    });

    best = {
      id: completeScenarios[0].id,
      total: completeScenarios[0].total,
    };
  }

  return {
    perStore,
    cross,
    best,
  };
}
