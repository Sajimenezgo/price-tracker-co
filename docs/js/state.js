// docs/js/state.js
// Gestión centralizada de estado con persistencia en localStorage y patrón pub/sub simple.

import { DEFAULT_SHIPPING } from "./cart-logic.js";
import { PAYMENT_METHODS } from "./finance.js";

const PAGE_SIZE = 48;
const STORAGE_KEYS = {
  cart: "cart",
  shipping: "price_tracker_shipping",
  teas: "price_tracker_teas",
};

/**
 * Carga segura de datos en localStorage con manejo de excepciones (ej. modo incógnito restringido).
 */
function loadStorage(key, fallback) {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Guarda segura de datos en localStorage.
 */
function saveStorage(key, data) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch {
    // Modo privado o cuota excedida: silenciar para no romper la app
  }
}

/**
 * Genera la clave canónica de un ítem en el carrito:
 * Si el producto tiene modelo, se agrupa como 'm:MODELO' para permitir comparación multi-tienda.
 * Si no tiene modelo, se referencia por 's:TIENDA:SKU'.
 * @param {{model?: string|null, store: string, sku: string}} p
 * @returns {string}
 */
export const cartKey = (p) => (p.model ? `m:${p.model}` : `s:${p.store}:${p.sku}`);

/**
 * Clona profundamente las reglas de envío por defecto para evitar mutaciones directas.
 */
function cloneDefaultShipping() {
  const cloned = {};
  for (const [store, rule] of Object.entries(DEFAULT_SHIPPING)) {
    cloned[store] = { ...rule };
  }
  return cloned;
}

/**
 * Inicializa el diccionario de tasas efectivas anuales (TEA) con los valores por defecto de cada medio.
 */
function initialTeas() {
  const saved = loadStorage(STORAGE_KEYS.teas, {});
  const teas = {};
  for (const [key, method] of Object.entries(PAYMENT_METHODS)) {
    const custom = saved?.[key];
    teas[key] = (typeof custom === "number" && Number.isFinite(custom) && custom >= 0)
      ? custom
      : method.defaultTea;
  }
  return teas;
}

/**
 * Estado global único de la aplicación.
 */
export const state = {
  // Catálogo y filtros
  products: [],
  updatedAt: "",
  stores: [],
  categories: [],
  filters: {
    q: "",
    stores: new Set(),
    category: "",
    brand: "",
    min: null,
    max: null,
    sort: "price",
  },
  catalogShown: PAGE_SIZE,

  // Carrito y logística
  cart: loadStorage(STORAGE_KEYS.cart, {}),
  shipping: { ...cloneDefaultShipping(), ...loadStorage(STORAGE_KEYS.shipping, {}) },

  // Simulación y financiamiento
  method: "cmr",
  basis: "best", // "best" | "cross" | "exito" | "falabella" | "jumbo"
  teas: initialTeas(),
  selectedPlazo: 12, // 12, 24, 36
  amortizationTerm: 12, // 1 a 72

  // UI
  drawerOpen: false,
};

const listeners = new Set();

/**
 * Suscribe un callback a cambios de estado. Retorna función de desuscripción.
 * @param {(state: typeof state, event?: {type: string, [k: string]: any}) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Notifica a todos los suscriptores.
 * @param {{type: string, [k: string]: any}} [event]
 */
export function notify(event = { type: "generic" }) {
  for (const fn of listeners) {
    try {
      fn(state, event);
    } catch (err) {
      console.error("[State Notify Error]:", err);
    }
  }
}

/**
 * Inicializa los datos del catálogo cargados de data.json.
 */
export function initData(data) {
  state.products = Array.isArray(data.products) ? data.products : [];
  state.updatedAt = data.updated_at || "";
  state.stores = Array.isArray(data.stores) ? data.stores : [];
  state.categories = Array.isArray(data.categories) ? data.categories : [];
  notify({ type: "init" });
}

/**
 * Actualiza los filtros de búsqueda del catálogo.
 */
export function setFilter(key, value) {
  state.filters[key] = value;
  state.catalogShown = PAGE_SIZE;
  notify({ type: "filters", key, value });
}

/**
 * Incrementa la cantidad de ítems mostrados en el catálogo ("Ver más").
 */
export function loadMoreProducts() {
  state.catalogShown += PAGE_SIZE;
  notify({ type: "pagination" });
}

/**
 * Agrega un producto al carrito o incrementa su cantidad.
 */
export function addToCart(product) {
  if (!product) return;
  const k = cartKey(product);
  if (state.cart[k]) {
    state.cart[k] = {
      ...state.cart[k],
      qty: (state.cart[k].qty || 1) + 1,
    };
  } else {
    state.cart[k] = {
      key: k,
      name: product.name,
      model: product.model || null,
      qty: 1,
      store: product.store,
      sku: product.sku,
    };
  }
  saveStorage(STORAGE_KEYS.cart, state.cart);
  notify({ type: "cart", action: "add", key: k });
}

/**
 * Actualiza la cantidad de un ítem existente en el carrito.
 */
export function updateCartQty(key, qty) {
  if (!state.cart[key]) return;
  const safeQty = Math.max(1, parseInt(qty, 10) || 1);
  state.cart[key] = {
    ...state.cart[key],
    qty: safeQty,
  };
  saveStorage(STORAGE_KEYS.cart, state.cart);
  notify({ type: "cart", action: "update_qty", key, qty: safeQty });
}

/**
 * Remueve un producto del carrito por su clave canónica.
 */
export function removeFromCart(key) {
  if (!state.cart[key]) return;
  delete state.cart[key];
  saveStorage(STORAGE_KEYS.cart, state.cart);
  notify({ type: "cart", action: "remove", key });
}

/**
 * Vacía completamente el carrito.
 */
export function clearCart() {
  state.cart = {};
  saveStorage(STORAGE_KEYS.cart, state.cart);
  notify({ type: "cart", action: "clear" });
}

/**
 * Actualiza la regla de flete (tarifa base o umbral gratis) para una tienda.
 */
export function updateShippingRule(store, changes) {
  const current = state.shipping[store] || { fee: 0, freeFrom: 0 };
  const updated = {
    fee: typeof changes.fee === "number" && !isNaN(changes.fee) ? Math.max(0, changes.fee) : current.fee,
    freeFrom: typeof changes.freeFrom === "number" && !isNaN(changes.freeFrom) ? Math.max(0, changes.freeFrom) : current.freeFrom,
  };
  state.shipping[store] = updated;
  saveStorage(STORAGE_KEYS.shipping, state.shipping);
  notify({ type: "shipping", store, updated });
}

/**
 * Restablece las reglas de flete a los valores por defecto.
 */
export function resetShippingRules() {
  state.shipping = cloneDefaultShipping();
  saveStorage(STORAGE_KEYS.shipping, state.shipping);
  notify({ type: "shipping", reset: true });
}

/**
 * Cambia el medio de pago seleccionado actualmente para el simulador y la amortización.
 */
export function setPaymentMethod(methodKey) {
  if (!PAYMENT_METHODS[methodKey]) return;
  state.method = methodKey;
  notify({ type: "payment_method", method: methodKey });
}

/**
 * Cambia la base de compra del simulador: "best", "cross", o la tienda específica ("exito", etc.).
 */
export function setBasis(basis) {
  state.basis = basis;
  notify({ type: "basis", basis });
}

/**
 * Actualiza la Tasa Efectiva Anual (TEA) para un medio de pago dado.
 */
export function setTea(methodKey, teaValue) {
  const tea = Math.max(0, parseFloat(teaValue) || 0);
  state.teas[methodKey] = tea;
  saveStorage(STORAGE_KEYS.teas, state.teas);
  notify({ type: "tea", method: methodKey, tea });
}

/**
 * Cambia el plazo seleccionado en los tabs del simulador (12, 24, 36).
 */
export function setSelectedPlazo(plazo) {
  const p = parseInt(plazo, 10);
  if ([12, 24, 36].includes(p)) {
    state.selectedPlazo = p;
    notify({ type: "plazo", plazo: p });
  }
}

/**
 * Cambia el plazo de la tabla de amortización (1 a 72 meses).
 */
export function setAmortizationTerm(term) {
  const t = Math.min(72, Math.max(1, parseInt(term, 10) || 12));
  state.amortizationTerm = t;
  notify({ type: "amortization_term", term: t });
}

/**
 * Abre o cierra el drawer del carrito.
 */
export function setDrawerOpen(isOpen) {
  state.drawerOpen = Boolean(isOpen);
  notify({ type: "drawer", open: state.drawerOpen });
}

/**
 * Retorna la lista de ítems del carrito como array.
 */
export function getCartItems() {
  return Object.values(state.cart);
}

/**
 * Retorna el conteo total de unidades en el carrito.
 */
export function getCartCount() {
  return Object.values(state.cart).reduce((sum, item) => sum + (item.qty || 1), 0);
}
