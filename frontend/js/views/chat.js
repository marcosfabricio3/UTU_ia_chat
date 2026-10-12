/* =========================================================================
   CVlight — views/chat.js
   Chat RAG sobre los CVs de una vacante: respuestas con fuentes y resaltado.
   ========================================================================= */
window.CV = window.CV || {};
CV.views = CV.views || {};
(function (CV) {
  "use strict";

  const { esc, prettifyName, richText } = CV.util;
  const api = CV.api;

  let panelEl = null;
  let jobId = null;
  let loading = false;
  let messages = []; // { role: 'user'|'bot', text, sources?, error? }
  let history = [];  // [{ role:'user'|'assistant', content }]

  const SUGGESTIONS = [
    "¿Quién tiene más experiencia con React?",
    "¿Cuáles son las brechas más comunes?",
    "¿Qué candidatos tienen inglés técnico?",
    "Hacé un resumen de los 3 mejores perfiles.",
  ];

  function mount(panel) { panelEl = panel; }

  function resolveJob() {
    return CV.util.resolveJob(CV.app.state.jobs, jobId);
  }

  function render() {
    if (!panelEl) return;
    const jobs = CV.app.state.jobs || [];
    jobId = resolveJob();

    if (!jobs.length) {
      panelEl.innerHTML = emptyPanel(
        CV.app.state.jobsError || "Todavía no hay vacantes.",
        "Creá una vacante y analizá sus CVs para poder conversar sobre ellos."
      );
      return;
    }

    const job = jobs.find((j) => j.id === jobId);
    const analyzed = (job.cvs || []).some((c) => typeof c.score === "number");

    panelEl.innerHTML = `
      <div class="chat-wrap">
        <div class="toolbar block">
          <label for="chat-job">Vacante</label>
          <select id="chat-job">
            ${jobs.map((j) => CV.util.jobOption(j, jobId)).join("")}
          </select>
          ${analyzed ? "" : '<span class="status error">Analizá los CVs primero.</span>'}
        </div>

        <section class="block panel" aria-label="Conversación sobre los CVs">
          <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-relevant="additions text"></div>

          ${
            messages.length
              ? ""
              : `<div class="suggestions" id="chat-suggestions">
                  ${SUGGESTIONS.map((s) => `<button class="suggestion" type="button">${esc(s)}</button>`).join("")}
                 </div>`
          }

          <form class="chat-form" id="chat-form">
            <label class="visually-hidden" for="chat-input">Escribí tu pregunta</label>
            <input id="chat-input" type="text" autocomplete="off" placeholder="Escribí tu pregunta…" ${analyzed ? "" : "disabled"}>
            <button class="btn" type="submit" ${analyzed ? "" : "disabled"}>Enviar</button>
          </form>
        </section>
      </div>`;

    panelEl.querySelector("#chat-job").addEventListener("change", (e) => {
      jobId = e.target.value;
      CV.app.setActiveJob(jobId);
      messages = [];
      history = [];
      render();
    });

    panelEl.querySelector("#chat-form").addEventListener("submit", onSubmit);

    const sugg = panelEl.querySelector("#chat-suggestions");
    if (sugg) {
      sugg.addEventListener("click", (e) => {
        const b = e.target.closest(".suggestion");
        if (!b) return;
        panelEl.querySelector("#chat-input").value = b.textContent;
        onSubmit(new Event("submit"));
      });
    }

    renderLog();
  }

  function renderLog() {
    const log = panelEl.querySelector("#chat-log");
    if (!log) return;

    const job = (CV.app.state.jobs || []).find((j) => j.id === jobId);
    if (!messages.length && !loading) {
      log.innerHTML = `
        <div class="empty">
          <span class="empty-title">Preguntá sobre los CVs</span>
          <p>Respondo usando <strong>solo</strong> la información de los candidatos de "${esc(job ? job.titulo : "esta vacante")}" y te muestro las fuentes.</p>
        </div>`;
      return;
    }

    log.innerHTML =
      messages.map(msgHtml).join("") +
      (loading
        ? `<div class="msg bot"><span class="who">CVlight</span><span class="typing"><span class="spinner" aria-hidden="true"></span>Leyendo los CVs…</span></div>`
        : "");

    log.scrollTop = log.scrollHeight;
  }

  function msgHtml(m) {
    if (m.role === "user") {
      return `<div class="msg user"><span class="who">Vos</span><div class="bubble">${esc(m.text)}</div></div>`;
    }
    const names = (m.sources || []).map((s) => prettifyName(s.archivo));
    // Los errores se muestran como texto plano; las respuestas, con Markdown mínimo.
    const body = m.error ? esc(m.text) : richText(m.text, names);
    const sources = (m.sources || [])
      .map(
        (s) =>
          `<span class="src">${esc(s.archivo)} <span class="sim">${Math.round(s.similitud * 1000) / 1000}</span></span>`
      )
      .join("");
    return `<div class="msg bot ${m.error ? "is-error" : ""}">
      <span class="who">CVlight</span>
      <div class="bubble">${body}</div>
      ${sources ? `<div class="srcs">${sources}</div>` : ""}
    </div>`;
  }

  async function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;

    const input = panelEl.querySelector("#chat-input");
    const text = input.value.trim();
    if (!text) return;

    const job = (CV.app.state.jobs || []).find((j) => j.id === jobId);
    if (!job) return;

    const analyzed = (job.cvs || []).some((c) => typeof c.score === "number");
    if (!analyzed) {
      CV.app.toast("Analizá los CVs primero.");
      return;
    }

    messages.push({ role: "user", text });
    history.push({ role: "user", content: text });
    input.value = "";
    loading = true;

    const sugg = panelEl.querySelector("#chat-suggestions");
    if (sugg) sugg.remove();

    renderLog();

    try {
      const data = await api.chat(jobId, text, history);
      messages.push({ role: "bot", text: data.respuesta || "(sin respuesta)", sources: data.fuentes || [] });
      history.push({ role: "assistant", content: data.respuesta || "" });
    } catch (err) {
      messages.push({ role: "bot", text: err.message, error: true });
    } finally {
      loading = false;
      renderLog();
      const i = panelEl.querySelector("#chat-input");
      if (i) i.focus();
    }
  }

  function emptyPanel(title, extra) {
    return CV.util.emptyBox(title, extra);
  }

  CV.views.chat = {
    mount,
    onShow() {
      const prev = jobId;
      jobId = resolveJob();
      if (jobId !== prev) {
        messages = [];
        history = [];
      }
      render();
    },
  };
})(window.CV);
