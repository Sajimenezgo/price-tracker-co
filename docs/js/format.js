// docs/js/format.js
// Utilidades puras de formateo, sanitización y constantes de presentación.

/**
 * Nombres oficiales de las tiendas soportadas.
 */
export const STORE_NAMES = {
  exito: "Éxito",
  falabella: "Falabella",
  jumbo: "Jumbo",
};

/**
 * Retorna el nombre legible de una tienda.
 * @param {string} storeKey
 * @returns {string}
 */
export function formatStore(storeKey) {
  return STORE_NAMES[storeKey] || storeKey || "";
}

/**
 * Formatea un monto numérico como moneda en pesos colombianos (COP).
 * Si el valor es nulo o inválido, devuelve "—".
 * @param {number|null|undefined} amount
 * @returns {string}
 */
export function cop(amount) {
  if (amount == null || typeof amount !== "number" || !Number.isFinite(amount)) {
    return "—";
  }
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un porcentaje numérico con decimales configurables.
 * @param {number|null|undefined} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function pct(value, decimals = 1) {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) {
    return "0%";
  }
  return `${value.toFixed(decimals)}%`;
}

/**
 * Escapa caracteres HTML peligrosos para mitigar XSS en datos scrapeados.
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
 * Valida que una URL utilice protocolo HTTP o HTTPS antes de renderizarla en el DOM.
 * Si es inválida o sospechosa, retorna "#".
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function safeUrl(url) {
  if (!url || typeof url !== "string") return "#";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return esc(trimmed);
  }
  return "#";
}
