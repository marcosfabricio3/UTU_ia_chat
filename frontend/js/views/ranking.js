/* =========================================================================
   CVlight — views/ranking.js
   Encabezado con KPIs + distribución, y placas (dossiers) por candidato.
   ========================================================================= */
window.CV = window.CV || {};
CV.views = CV.views || {};
(function (CV) {
  "use strict";

  const { esc, band, prettifyName, round, icon } = CV.util;
  const api = CV.api;

  let panelEl = null;
  let jobId = null;
  const counted = {}; // jobId -> ya contó
  const openIds = new Set(); // dossiers expandidos

  function mount(panel) { panelEl = panel; }

  function resolveJob() {
    return CV.util.resolveJob(CV.app.state.jobs, jobId);
  }

  function render() {
    if (!panelEl) return;
    const jobs = CV.app.state.jobs || [];
    jobId = resolveJob();

    if (!jobs.length) {
      panelEl.innerHTML = emptyState(
        CV.app.state.jobsError || "Todavía no hay vacantes.",
        "Creá una vacante y analizá sus CVs para ver el ranking."
      );
      return;
    }

    panelEl.innerHTML = `
      <div class="toolbar block">
        <label for="rank-job">Vacante</label>
        <select id="rank-job">
          ${jobs.map((j) => option(j)).join("")}
        </select>
      </div>
      <div id="rank-body">
        <p class="status"><span class="spinner" aria-hidden="true"></span>Cargando ranking…</p>
      </div>`;

    panelEl.querySelector("#rank-job").addEventListener("change", (e) => {
      jobId = e.target.value;
      CV.app.setActiveJob(jobId);
      loadRanking();
    });

    loadRanking();
  }

  function option(job) {
    return CV.util.jobOption(job, jobId);
  }

  async function loadRanking() {
    const requested = jobId;
    const body = panelEl.querySelector("#rank-body");
    if (!body) return;

    const job = (CV.app.state.jobs || []).find((j) => j.id === jobId);
    if (!job) {
      body.innerHTML = emptyState("Vacante no encontrada.");
      return;
    }

    const analyzed = (job.cvs || []).filter((c) => typeof c.score === "number");
    if (!analyzed.length) {
      body.innerHTML = emptyState(
        "Esta vacante todavía no tiene CVs analizados.",
        'Andá a <strong>Vacantes</strong>, subí los PDFs de la vacante "' + esc(job.titulo) + '" y tocá <strong>Analizar CVs</strong>.'
      );
      return;
    }

    try {
      const data = await api.ranking(requested);
      if (requested !== jobId) return;   /* se cambió de vacante mientras cargaba */
      renderBody(job, data);
    } catch (err) {
      if (requested !== jobId) return;
      body.innerHTML = emptyState(err.message);
    }
  }

  function renderBody(job, data) {
    const body = panelEl.querySelector("#rank-body");
    const items = data.ranking || [];

    const bars = items
      .map((r) => {
        const b = band(r.score);
        return `<span class="bar ${b.key}" style="height:${Math.max(6, Number(r.score))}%"></span>`;
      })
      .join("");

    const distSummary = items.map((r) => r.score).join(", ");

    body.innerHTML = `
      <div class="block rank-head">
        <div>
          <h3 class="rh-title">${esc(job.titulo)}</h3>
          <div class="sub">Ranking de candidatos por ajuste a la vacante</div>
        </div>
        <div class="dist" aria-hidden="true">${bars}</div>
        <p class="visually-hidden">Distribución de puntajes: ${esc(distSummary)}</p>
        <div class="rh-stats">
          <div class="stat"><span class="k">CVs</span><span class="v">${data.total}</span></div>
          <div class="stat stat-hero"><span class="k">Promedio</span><span class="v">${round(data.promedio, 1)}</span></div>
        </div>
      </div>

      <ul class="dossier-list">
        ${items.map((r, i) => dossier(r, i + 1)).join("")}
      </ul>`;

    body.querySelector(".dossier-list").addEventListener("click", onDossierClick);

    animateScores(body);
  }

  function dossier(r, rank) {
    const b = band(r.score);
    const name = prettifyName(r.archivo);
    const open = openIds.has(r.id);
    const years = r.anios_experiencia != null ? r.anios_experiencia + (r.anios_experiencia === 1 ? " año" : " años") : "—";
    const start = CV.util.prefersReducedMotion() ? 0 : Math.min(rank - 1, 8) * 45;

    const list = (arr, cls) =>
      Array.isArray(arr) && arr.length
        ? `<ul class="list ${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : '<p class="sub">No especificado.</p>';

    const skills =
      Array.isArray(r.skills_match) && r.skills_match.length
        ? `<div class="chips">${r.skills_match.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>`
        : '<p class="sub">No especificado.</p>';

    return `
      <li class="block dossier band-${b.key} block--lift settle" style="animation-delay:${start}ms">
        <div class="d-head">
          <span class="d-rank">${rank}</span>
          <span class="d-who">
            <span class="d-name">${esc(name)}<a class="d-open" href="${esc(api.cvFileUrl(jobId, r.id))}" target="_blank" rel="noopener" aria-label="Abrir el CV «${esc(r.archivo)}» en una pestaña nueva">${icon("square-arrow-out-up-right", 16)}</a></span>
            <span class="d-file">${esc(r.archivo)}</span>
            <span class="d-sum">${esc(r.resumen || "Sin resumen.")}</span>
          </span>
          <span class="band ${b.key}">${b.label}</span>
          <span class="d-score ${b.key}" data-score="${esc(r.score)}">${esc(r.score)}</span>
          <button class="d-toggle" type="button" data-dossier="${esc(r.id)}" aria-expanded="${open}" aria-controls="db-${esc(r.id)}">
            <span class="chev" aria-hidden="true">${icon(open ? "chevron-up" : "chevron-down")}</span>
            <span class="visually-hidden">Detalle del candidato «${esc(name)}»</span>
          </button>
        </div>

        <div class="track ${b.key}" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, r.score))}%"></span></div>

        <div class="d-body well" id="db-${esc(r.id)}" ${open ? "" : "hidden"}>
          <div class="d-section">
            <h4>Experiencia</h4>
            <p>${esc(years)}</p>
          </div>
          <div class="d-section">
            <h4>Resumen</h4>
            <p>${esc(r.resumen || "No especificado.")}</p>
          </div>
          <div class="d-section">
            <h4>Fortalezas</h4>
            ${list(r.fortalezas, "pos")}
          </div>
          <div class="d-section">
            <h4>Brechas</h4>
            ${list(r.gaps, "neg")}
          </div>
          <div class="d-section">
            <h4>Skills que coinciden</h4>
            ${skills}
          </div>
          <div class="d-section">
            <h4>Recomendación</h4>
            <p class="rec">${esc(r.recomendacion || "No especificado.")}</p>
          </div>
        </div>
      </li>`;
  }

  function onDossierClick(e) {
    // El toggle sólo es el chevron (estirado sobre la placa con ::after); el
    // icono de "abrir PDF" es un <a> hermano, así que su click no llega acá.
    const head = e.target.closest(".d-toggle");
    if (!head) return;
    const id = head.dataset.dossier;
    const detail = panelEl.querySelector("#db-" + CSS.escape(id));
    const willOpen = head.getAttribute("aria-expanded") !== "true";

    head.setAttribute("aria-expanded", willOpen ? "true" : "false");
    // El detalle se muestra/oculta en el lugar (sin re-render), así que el
    // chevron de Lucide hay que intercambiarlo a mano.
    const chev = head.querySelector(".chev");
    if (chev) chev.innerHTML = icon(willOpen ? "chevron-up" : "chevron-down");
    if (detail) detail.hidden = !willOpen;
    if (willOpen) openIds.add(id);
    else openIds.delete(id);
  }

  function animateScores(container) {
    const reduced = CV.util.prefersReducedMotion();
    if (reduced || counted[jobId]) return;
    counted[jobId] = true;

    container.querySelectorAll("[data-score]").forEach((node) => {
      const target = Number(node.dataset.score) || 0;
      const start = performance.now();
      const dur = 700;
      const ease = (p) => 1 - Math.pow(1 - p, 3);
      function tick(t) {
        const p = Math.min(1, (t - start) / dur);
        node.textContent = String(Math.round(target * ease(p)));
        if (p < 1) requestAnimationFrame(tick);
        else node.textContent = String(target);
      }
      requestAnimationFrame(tick);
    });
  }

  function emptyState(title, extra) {
    return CV.util.emptyBox(title, extra);
  }

  CV.views.ranking = {
    mount,
    onShow() {
      jobId = resolveJob();
      render();
    },
  };
})(window.CV);
