// docs/js/app.js
// Punto de entrada principal (SPA sin build, JS ESM nativo).
// Inicializa la carga de datos, el estado centralizado y monta los componentes modulares.

import { state, initData, getCartCount, setDrawerOpen, subscribe } from "./state.js";
import { initCatalog } from "./components/catalog.js";
import { initCart } from "./components/cart.js";
import { initPaymentPanel } from "./components/payment-panel.js";
import { initAmortizationTable } from "./components/amortization-table.js";

const $ = (id) => document.getElementById(id);

let lastFocusedElement = null;

/**
 * Control accesible de apertura y cierre del drawer con trampa de foco y soporte para tecla Escape.
 */
function setupDrawer() {
  const drawer = $("drawer");
  const backdrop = $("backdrop");
  const closeBtn = $("closeCart");
  const openBtn = $("openCart");
  const drawerContent = $("drawerContent");

  function open() {
    lastFocusedElement = document.activeElement;
    setDrawerOpen(true);
    drawer.classList.remove("hidden");
    openBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";

    // Foco en el botón cerrar al abrir para accesibilidad
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 50);
    }
  }

  function close() {
    setDrawerOpen(false);
    drawer.classList.add("hidden");
    openBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";

    // Restaurar foco al elemento que disparó la apertura
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    } else if (openBtn) {
      openBtn.focus();
    }
  }

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);

  // Cerrar con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.classList.contains("hidden")) {
      e.preventDefault();
      close();
    }
  });

  // Trampa de foco accesible dentro del drawer
  if (drawer) {
    drawer.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;

      const focusables = drawer.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }
}

/**
 * Sincroniza la insignia con la cantidad de productos en el botón del carrito.
 */
function updateCartBadge() {
  const badge = $("cartCount");
  if (badge) {
    badge.textContent = getCartCount();
  }
}

/**
 * Inicialización de la aplicación.
 */
async function boot() {
  setupDrawer();
  updateCartBadge();

  // Suscribirse para mantener actualizado el contador del carrito
  subscribe((currentState, event) => {
    if (event?.type === "cart" || event?.type === "init") {
      updateCartBadge();
    }
  });

  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();

    // 1. Inicializar estado centralizado
    initData(data);

    // 2. Fecha de actualización
    const updatedEl = $("updated");
    if (updatedEl && data.updated_at) {
      try {
        const date = new Date(data.updated_at);
        updatedEl.textContent = `Actualizado: ${date.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`;
      } catch {
        updatedEl.textContent = `Actualizado: ${data.updated_at}`;
      }
    }

    // 3. Montar componentes
    initCatalog({
      qInput: $("q"),
      storesContainer: $("fStores"),
      catSelect: $("fCat"),
      brandSelect: $("fBrand"),
      minInput: $("pMin"),
      maxInput: $("pMax"),
      sortSelect: $("sort"),
      resultInfo: $("resultInfo"),
      gridContainer: $("grid"),
      moreButton: $("more"),
    });

    initCart($("cartContainer"));
    initPaymentPanel($("paymentContainer"));
    initAmortizationTable($("amortizationContainer"));

  } catch (err) {
    console.error("[Boot Error]:", err);
    const info = $("resultInfo");
    if (info) {
      info.textContent = `No se pudo cargar el catálogo de productos: ${err.message}.`;
      info.classList.add("text-red-600");
    }
  }
}

boot();
