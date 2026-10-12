/* =========================================================================
   CVlight — app.js
   Estado compartido, router de pestañas, preferencia de tema (claro/oscuro)
   y toast.

   Contrato de vista (CV.views.<nombre>):
     · mount(panel) → construye la estructura fija, una sola vez.
     · onShow()     → (re)renderiza al activarse la pestaña.
   Agregar una vista = archivo en js/views/ + entrada en VIEWS/PANEL_ID +
   su <section role="tabpanel"> en index.html.
   ========================================================================= */
window.CV = window.CV || {};
(function (CV) {
  "use strict";

  const VIEWS = ["vacantes", "ranking", "chat"];
  const PANEL_ID = { vacantes: "panel-vacantes", ranking: "panel-ranking", chat: "panel-chat" };

  const state = {
    jobs: [],
    activeJobId: null,
    jobsError: null,
  };

  let tabAPI = null;
  let currentView = "vacantes";

  /* ---------------- Tema: <theme-switch> (web component) ----------------
     La lógica (claro / oscuro / automático + persistencia + seguimiento de
     prefers-color-scheme) la aporta assets/vendor/theme-switch.min.js, que
     escribe html[data-theme] con el tema EFECTIVO. Acá sólo queda lo que la
     librería no cubre: el nombre accesible de su botón y el theme-color. */
  function initThemeSwitch() {
    const el = document.querySelector("theme-switch");
    if (el && window.customElements) {
      customElements.whenDefined("theme-switch").then(() => {
        const btn = el.shadowRoot && el.shadowRoot.querySelector("button");
        if (btn) {
          btn.setAttribute("type", "button");
          btn.setAttribute("aria-label", "Tema: claro, oscuro o automático");
        }
      });
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const sync = () => {
        meta.setAttribute(
          "content",
          document.documentElement.dataset.theme === "dark" ? "#0B0B0B" : "#FF7A6B"
        );
      };
      new MutationObserver(sync).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      sync();
    }
  }

  /* ---------------- Toast (visible + aria-live) ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = msg;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  /* ---------------- Alto real de la navbar (para fusionar la columna) ---------------- */
  function syncNavHeight() {
    const m = document.querySelector(".masthead");
    if (!m) return;
    document.documentElement.style.setProperty("--nav-h", m.offsetHeight + "px");
  }

  /* ---------------- Datos ---------------- */
  async function loadJobs() {
    try {
      const data = await CV.api.listJobs();
      state.jobs = data.jobs || [];
      state.jobsError = null;
    } catch (err) {
      state.jobs = [];
      state.jobsError = err.message;
    }
  }

  function setActiveJob(id) {
    state.activeJobId = id;
  }

  /* ---------------- Router ---------------- */
  function viewFromHash() {
    const h = (location.hash || "").replace("#", "");
    return VIEWS.includes(h) ? h : null;
  }

  function showView(name) {
    const index = VIEWS.indexOf(name);
    if (index < 0 || !tabAPI) return;
    tabAPI.activate(index, true);
  }

  function showPanelByIndex(index, updateHash = true) {
    const name = VIEWS[index];
    currentView = name;

    VIEWS.forEach((v, i) => {
      const panel = document.getElementById(PANEL_ID[v]);
      if (!panel) return;
      panel.hidden = i !== index;
    });

    if (updateHash) {
      const target = "#" + name;
      if (location.hash !== target) {
        try {
          history.replaceState(null, "", target);
        } catch (err) {
          /* file:// puede bloquear replaceState; el hash es opcional */
        }
      }
    }

    const view = CV.views[name];
    if (view && view.onShow) view.onShow(name);
  }

  /* ---------------- Init ---------------- */
  async function init() {
    initThemeSwitch();
    syncNavHeight();
    window.addEventListener("resize", syncNavHeight);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncNavHeight);

    // Skip-link: mueve el foco al contenido sin ensuciar el hash de la ruta.
    const skip = document.querySelector(".skip-link");
    if (skip) {
      skip.addEventListener("click", (e) => {
        const target = document.getElementById("view");
        if (!target) return;
        e.preventDefault();
        target.focus();
      });
    }

    // Monta cada vista en su panel (una vez).
    VIEWS.forEach((name) => {
      const panel = document.getElementById(PANEL_ID[name]);
      if (panel && CV.views[name] && CV.views[name].mount) CV.views[name].mount(panel);
    });

    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    tabAPI = CV.a11y.tabs(tabs, (index) => showPanelByIndex(index));

    // Delegado para botones "Ir a Vacantes" (estados vacíos).
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-goto]");
      if (b) showView(b.dataset.goto);
    });

    // Deep-linking por hash (#vacantes | #ranking | #chat).
    window.addEventListener("hashchange", () => {
      const v = viewFromHash();
      if (v && v !== currentView) showView(v);
    });

    await loadJobs();
    const initial = viewFromHash();
    showPanelByIndex(initial ? VIEWS.indexOf(initial) : 0);
  }

  CV.app = { state, loadJobs, setActiveJob, showView, toast };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.CV);
