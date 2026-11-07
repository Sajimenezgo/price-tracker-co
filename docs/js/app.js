import { PAYMENT_METHODS, effectivePrice, amortization, scenario, teaToMonthly } from "./finance.js";

const STORE_NAMES = { exito: "Éxito", falabella: "Falabella", jumbo: "Jumbo" };
const PAGE = 48;
const $ = (id) => document.getElementById(id);
const cop = (n) => (n == null || Number.isNaN(n) ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//.test(u || "") ? esc(u) : "#");

const state = {
  products: [], shown: PAGE,
  filters: { q: "", stores: new Set(), category: "", brand: "", min: null, max: null, sort: "price" },
  cart: loadCart(), // { key: { key, name, model, qty, store, sku } }
  method: "cmr", basis: "mixed", teas: {},
};
for (const [k, m] of Object.entries(PAYMENT_METHODS)) state.teas[k] = m.defaultTea;

function loadCart() { try { return JSON.parse(localStorage.getItem("cart") || "{}"); } catch { return {}; } }
function saveCart() { try { localStorage.setItem("cart", JSON.stringify(state.cart)); } catch {} }
const cartKey = (p) => (p.model ? `m:${p.model}` : `s:${p.store}:${p.sku}`);

/* ---------- Carga ---------- */
async function init() {
  const res = await fetch("data.json", { cache: "no-cache" });
  const data = await res.json();
  state.products = data.products;
  $("updated").textContent = "Actualizado: " + new Date(data.updated_at).toLocaleString("es-CO", { timeZone: "America/Bogota" });
  buildFilters(data);
  bind();
  render();
  renderCart();
}

function buildFilters(data) {
  $("fStores").innerHTML = data.stores.map((s) =>
    `<label class="flex items-center gap-2 text-sm"><input type="checkbox" value="${esc(s)}" class="storeChk"> ${esc(STORE_NAMES[s] || s)}</label>`).join("");
  $("fCat").innerHTML = `<option value="">Todas</option>` + data.categories.map((c) => `<option>${esc(c)}</option>`).join("");
  const brands = [...new Set(state.products.map((p) => p.brand))].sort();
  $("fBrand").innerHTML = `<option value="">Todas</option>` + brands.map((b) => `<option>${esc(b)}</option>`).join("");
}

function bind() {
  const f = state.filters, upd = () => { state.shown = PAGE; render(); };
  $("q").addEventListener("input", (e) => { f.q = e.target.value.toLowerCase(); upd(); });
  $("fStores").addEventListener("change", () => { f.stores = new Set([...document.querySelectorAll(".storeChk:checked")].map((c) => c.value)); upd(); });
  $("fCat").addEventListener("change", (e) => { f.category = e.target.value; upd(); });
  $("fBrand").addEventListener("change", (e) => { f.brand = e.target.value; upd(); });
  $("pMin").addEventListener("input", (e) => { f.min = e.target.value ? +e.target.value : null; upd(); });
  $("pMax").addEventListener("input", (e) => { f.max = e.target.value ? +e.target.value : null; upd(); });
  $("sort").addEventListener("change", (e) => { f.sort = e.target.value; upd(); });
  $("more").addEventListener("click", () => { state.shown += PAGE; render(); });
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const p = state.products.find((x) => x.store + ":" + x.sku === b.dataset.add);
    const k = cartKey(p);
    state.cart[k] = state.cart[k] ? { ...state.cart[k], qty: state.cart[k].qty + 1 } : { key: k, name: p.name, model: p.model, qty: 1, store: p.store, sku: p.sku };
    saveCart(); renderCart();
  });
  $("openCart").addEventListener("click", () => { $("drawer").classList.remove("hidden"); renderCart(); });
  for (const id of ["closeCart", "backdrop"]) $(id).addEventListener("click", () => $("drawer").classList.add("hidden"));
  $("drawer").addEventListener("click", onDrawerClick);
  $("drawer").addEventListener("change", onDrawerChange);
}

/* ---------- Catálogo ---------- */
function filtered() {
  const { q, stores, category, brand, min, max, sort } = state.filters;
  const list = state.products.filter((p) =>
    (!stores.size || stores.has(p.store)) && (!category || p.category === category) && (!brand || p.brand === brand) &&
    (min == null || p.price >= min) && (max == null || p.price <= max) &&
    (!q || `${p.name} ${p.brand} ${p.model || ""}`.toLowerCase().includes(q)));
  const desc = sort.startsWith("-"), key = sort.replace("-", "");
  list.sort((a, b) => (key === "name" ? a.name.localeCompare(b.name) : (a[key] - b[key]) * (desc ? -1 : 1)));
  return list;
}

function render() {
  const list = filtered();
  $("resultInfo").textContent = `${list.length.toLocaleString("es-CO")} productos`;
  $("grid").innerHTML = list.slice(0, state.shown).map(card).join("");
  $("more").classList.toggle("hidden", list.length <= state.shown);
}

function card(p) {
  const id = esc(p.store + ":" + p.sku);
  return `<article class="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col">
    <div class="h-40 flex items-center justify-center"><img loading="lazy" src="${safeUrl(p.image_url)}" alt="${esc(p.name)}" class="max-h-40 object-contain" referrerpolicy="no-referrer"></div>
    <div class="mt-2 text-xs flex gap-2"><span class="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5">${esc(STORE_NAMES[p.store])}</span>
      <span class="text-slate-500">${esc(p.brand)}</span>${p.discount_pct > 0 ? `<span class="ml-auto text-red-600 font-semibold">-${Math.round(p.discount_pct)}%</span>` : ""}</div>
    <h3 class="mt-1 text-sm font-medium line-clamp-3 flex-1">${esc(p.name)}</h3>
    <div class="mt-2">${p.regular_price > p.price ? `<div class="text-xs line-through text-slate-400">${cop(p.regular_price)}</div>` : ""}
      <div class="text-lg font-bold">${cop(p.price)}</div>
      ${p.card_price ? `<div class="text-xs text-emerald-600 font-medium">${cop(p.card_price)} con ${esc(PAYMENT_METHODS[p.card_type]?.label || "tarjeta")}</div>` : ""}</div>
    <div class="mt-3 flex gap-2"><button data-add="${id}" class="flex-1 rounded-lg bg-indigo-600 text-white py-2 text-sm">Agregar</button>
      <a href="${safeUrl(p.product_url)}" target="_blank" rel="noopener noreferrer" class="rounded-lg border px-3 py-2 text-sm">Ver</a></div>
  </article>`;
}

/* ---------- Carrito comparativo ---------- */
// Precio de un ítem del carrito en cada tienda: se busca el mismo modelo en cada tienda (el más barato según el medio de pago).
function priceInStore(item, store, method) {
  const cands = state.products.filter((p) => p.store === store && (item.model ? p.model === item.model : p.sku === item.sku));
  if (!cands.length) return null;
  return Math.min(...cands.map((p) => effectivePrice(p, method)));
}

function cartTotals(method) {
  const items = Object.values(state.cart);
  const stores = Object.keys(STORE_NAMES);
  const perStore = {};
  for (const s of stores) {
    let total = 0, missing = 0;
    for (const it of items) { const pr = priceInStore(it, s, method); if (pr == null) missing++; else total += pr * it.qty; }
    perStore[s] = { total, missing };
  }
  let mixed = 0; const picks = [];
  for (const it of items) {
    const opts = stores.map((s) => [s, priceInStore(it, s, method)]).filter(([, p]) => p != null);
    if (!opts.length) continue;
    const [s, p] = opts.reduce((a, b) => (b[1] < a[1] ? b : a));
    mixed += p * it.qty; picks.push({ it, store: s, price: p });
  }
  return { perStore, mixed, picks };
}

function renderCart() {
  const items = Object.values(state.cart);
  $("cartCount").textContent = items.reduce((n, i) => n + i.qty, 0);
  if ($("drawer").classList.contains("hidden")) return;
  if (!items.length) { $("cartItems").innerHTML = `<p class="text-slate-500">El carrito está vacío.</p>`; $("cartCompare").innerHTML = $("simulator").innerHTML = ""; return; }

  $("cartItems").innerHTML = `<ul class="divide-y dark:divide-slate-700">${items.map((i) => `
    <li class="py-2 flex items-center gap-3 text-sm"><span class="flex-1">${esc(i.name)}${i.model ? ` <span class="text-xs text-slate-400">(${esc(i.model)})</span>` : ""}</span>
      <input type="number" min="1" value="${i.qty}" data-qty="${esc(i.key)}" class="w-16 rounded border px-2 py-1 dark:bg-slate-900 dark:border-slate-600">
      <button data-rm="${esc(i.key)}" class="text-red-600">Quitar</button></li>`).join("")}</ul>`;

  const t = cartTotals(state.method);
  const best = Math.min(t.mixed, ...Object.values(t.perStore).filter((s) => !s.missing).map((s) => s.total));
  $("cartCompare").innerHTML = `<h3 class="font-semibold mb-2">Comparativo de compra (precio según medio de pago: ${esc(PAYMENT_METHODS[state.method].label)})</h3>
    <div class="grid sm:grid-cols-4 gap-3">${Object.entries(t.perStore).map(([s, v]) => `
      <div class="rounded-lg border p-3 ${!v.missing && v.total === best ? "border-emerald-500" : ""}"><div class="text-xs text-slate-500">Todo en ${esc(STORE_NAMES[s])}</div>
        <div class="font-bold">${cop(v.total)}</div>${v.missing ? `<div class="text-xs text-amber-600">Faltan ${v.missing} ítem(s) en esta tienda</div>` : ""}</div>`).join("")}
      <div class="rounded-lg border p-3 ${t.mixed === best ? "border-emerald-500" : ""}"><div class="text-xs text-slate-500">Cruzado (lo más barato de cada tienda)</div>
        <div class="font-bold">${cop(t.mixed)}</div>
        <ul class="text-xs text-slate-500 mt-1">${t.picks.map((p) => `<li>${esc(STORE_NAMES[p.store])}: ${cop(p.price)}</li>`).join("")}</ul></div></div>`;
  renderSimulator(t);
}

/* ---------- Simulador financiero ---------- */
function renderSimulator(t) {
  const m = state.method, tea = state.teas[m];
  const basisTotal = state.basis === "mixed" ? t.mixed : t.perStore[state.basis].total;
  const rows = Object.entries(PAYMENT_METHODS).map(([k, pm]) => {
    const tt = cartTotals(k);
    const cap = state.basis === "mixed" ? tt.mixed : tt.perStore[state.basis].total;
    return { k, pm, cap, sc: scenario(cap, state.teas[k]) };
  });
  const bestTotal = Math.min(...rows.flatMap((r) => r.sc.map((s) => s.total)));
  const a24 = amortization(basisTotal, tea, 12);
  const monthly = (teaToMonthly(tea) * 100).toFixed(4);
  $("simulator").innerHTML = `
    <h3 class="font-semibold">Simulador financiero</h3>
    <div class="grid sm:grid-cols-3 gap-3 text-sm my-3">
      <label>Base de compra<select data-basis class="mt-1 w-full rounded border px-2 py-2 dark:bg-slate-900 dark:border-slate-600">
        <option value="mixed" ${state.basis === "mixed" ? "selected" : ""}>Cruzada (más barata)</option>
        ${Object.entries(STORE_NAMES).map(([s, n]) => `<option value="${s}" ${state.basis === s ? "selected" : ""}>Todo en ${n}</option>`).join("")}</select></label>
      <label>Medio de pago<select data-method class="mt-1 w-full rounded border px-2 py-2 dark:bg-slate-900 dark:border-slate-600">
        ${Object.entries(PAYMENT_METHODS).map(([k, pm]) => `<option value="${k}" ${m === k ? "selected" : ""}>${pm.label}</option>`).join("")}</select></label>
      <label>TEA % de este medio<input type="number" step="0.1" min="0" value="${tea}" data-tea class="mt-1 w-full rounded border px-2 py-2 dark:bg-slate-900 dark:border-slate-600"></label>
    </div>
    <p class="text-xs text-slate-500 mb-3">Tasa mensual vencida equivalente: <b>${monthly}%</b> = (1 + TEA)^(1/12) − 1. Ajusta la TEA según tu contrato; verifica que no supere la tasa de usura vigente.</p>
    <div class="overflow-x-auto"><table class="w-full text-sm text-right">
      <thead><tr class="text-xs text-slate-500"><th class="text-left py-1">Medio de pago</th><th>Capital</th>${[12, 24, 36].map((n) => `<th>${n} m: cuota</th><th>Total</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr class="border-t dark:border-slate-700"><td class="text-left py-1">${r.pm.label}<div class="text-xs text-slate-400">TEA ${state.teas[r.k]}%</div></td><td>${cop(r.cap)}</td>
        ${r.sc.map((s) => `<td>${cop(s.cuota)}</td><td class="${s.total === bestTotal ? "text-emerald-600 font-bold" : ""}">${cop(s.total)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="text-xs text-slate-500 mt-2">Total = capital (con descuento de tarjeta solo si el medio coincide) + intereses. En verde, el menor costo total.</p>
    <details class="mt-4"><summary class="cursor-pointer text-sm font-medium">Tabla de amortización — ${PAYMENT_METHODS[m].label}, 12 meses (cambia el plazo abajo)</summary>
      <label class="text-sm block my-2">Plazo (meses) <input type="number" min="1" max="72" value="12" data-term class="w-20 rounded border px-2 py-1 dark:bg-slate-900 dark:border-slate-600"></label>
      <div id="amort">${amortTable(a24)}</div></details>`;
}

function amortTable(a) {
  return `<div class="overflow-x-auto max-h-80"><table class="w-full text-sm text-right"><thead class="sticky top-0 bg-white dark:bg-slate-800 text-xs text-slate-500"><tr><th>#</th><th>Cuota</th><th>Interés</th><th>Abono capital</th><th>Saldo</th></tr></thead><tbody>
    ${a.rows.map((r) => `<tr class="border-t dark:border-slate-700"><td>${r.k}</td><td>${cop(r.cuota)}</td><td>${cop(r.interes)}</td><td>${cop(r.capital)}</td><td>${cop(r.saldo)}</td></tr>`).join("")}</tbody></table></div>
    <p class="text-xs mt-2">Intereses totales: <b>${cop(a.totalIntereses)}</b> · Total pagado: <b>${cop(a.totalPagado)}</b></p>`;
}

function onDrawerClick(e) {
  const rm = e.target.closest("[data-rm]");
  if (rm) { delete state.cart[rm.dataset.rm]; saveCart(); renderCart(); }
}
function onDrawerChange(e) {
  const t = e.target;
  if (t.dataset.qty) { state.cart[t.dataset.qty].qty = Math.max(1, parseInt(t.value) || 1); saveCart(); renderCart(); }
  else if (t.dataset.basis !== undefined) { state.basis = t.value; renderCart(); }
  else if (t.dataset.method !== undefined) { state.method = t.value; renderCart(); }
  else if (t.dataset.tea !== undefined) { state.teas[state.method] = Math.max(0, parseFloat(t.value) || 0); renderCart(); }
  else if (t.dataset.term !== undefined) {
    const n = Math.min(72, Math.max(1, parseInt(t.value) || 12)), tt = cartTotals(state.method);
    const cap = state.basis === "mixed" ? tt.mixed : tt.perStore[state.basis].total;
    $("amort").innerHTML = amortTable(amortization(cap, state.teas[state.method], n));
  }
}

init().catch((err) => { $("resultInfo").textContent = "No se pudo cargar data.json: " + err.message; });
