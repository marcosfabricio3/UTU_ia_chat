/* =========================================================================
   CVlight — views/chat.js
   Chat RAG sobre los CVs de una vacante: respuestas con fuentes y resaltado.
   ========================================================================= */
window.CV = window.CV || {};
CV.views = CV.views || {};
(function (CV) {
  "use strict";

  const { esc, prettifyName, richText, icon } = CV.util;
  const api = CV.api;

  let panelEl = null;
  let jobId = null;
  let loading = false;
  let streaming = false;
  let statusText = "Leyendo los CVs…"; // texto del indicador mientras se espera
  let messages = []; // { role: 'user'|'bot', text, sources?, error?, streaming? }
  let history = [];  // [{ role:'user'|'assistant', content }]
  let chatAbort = null; // AbortController del stream en curso (se cancela al cambiar de vacante)

  const SUGGESTIONS = [
    "¿Quién tiene más experiencia con React?",
    "¿Cuáles son las brechas más comunes?",
    "¿Qué candidatos tienen inglés técnico?",
    "Hacé un resumen de los 3 mejores perfiles.",
  ];

  function mount(panel) { panelEl = panel; }

  function resolveJob() {
    var fn = (CV.views.shared && CV.views.shared.resolveJob) ? CV.views.shared.resolveJob : CV.util.resolveJob;
    return fn(CV.app.state.jobs, jobId);
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
    const analyzed = (job.cvs || []).some((c) => c.analizado);

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
          <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-relevant="additions text" tabindex="0" aria-label="Historial de conversación"></div>

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
            <button class="btn chat-send" type="submit" aria-label="Enviar" ${analyzed ? "" : "disabled"}>${icon("send-horizontal", 20)}</button>
          </form>
        </section>
      </div>`;

    panelEl.querySelector("#chat-job").addEventListener("change", (e) => {
      // Al cambiar de vacante cortamos el stream en curso: evita mensajes
      // fantasma y que el contexto de A se mezcle con la vacante B.
      if (chatAbort) {
        try {
          chatAbort.abort();
        } catch (e) {
          /* nada */
        }
        chatAbort = null;
      }
      loading = false;
      streaming = false;
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
        ? `<div class="chat-msg bot"><span class="who">CVlight</span><span class="typing"><span class="spinner" aria-hidden="true"></span>${esc(statusText)}</span></div>`
        : "");

    // Mientras la respuesta se escribe, no anunciamos cada fragmento: el lector
    // de pantalla espera a que termine (aria-busy) y lee la respuesta completa.
    if (streaming) log.setAttribute("aria-busy", "true");
    else log.removeAttribute("aria-busy");

    log.scrollTop = log.scrollHeight;
  }

  // Actualiza solo la burbuja que se está escribiendo (sin re-renderizar todo
  // el log en cada fragmento). El HTML final se aplica en el renderLog de cierre.
  // Reusa msgHtml para que un aviso (m.note) quede bien dibujado.
  function updateStreamBubble(bot) {
    const log = panelEl.querySelector("#chat-log");
    if (!log) return;
    const node = log.querySelector(".chat-msg.bot.is-streaming");
    if (!node) {
      renderLog();
      return;
    }
    node.outerHTML = msgHtml(bot);
    log.scrollTop = log.scrollHeight;
  }

  function msgHtml(m) {
    if (m.role === "user") {
      return `<div class="chat-msg user"><span class="who">Vos</span><div class="bubble">${esc(m.text)}</div></div>`;
    }
    const names = (m.sources || []).map((s) => prettifyName(s.archivo));
    // Respuesta en curso: texto plano + cursor. Al terminar se re-renderiza con Markdown y fuentes.
    if (m.streaming) {
      const note = m.note ? `<span class="stream-note">${esc(m.note)}</span>` : "";
      return `<div class="chat-msg bot is-streaming"><span class="who">CVlight</span>${note}<div class="bubble">${esc(m.text)}</div></div>`;
    }
    // Los errores se muestran como texto plano; las respuestas, con Markdown mínimo.
    const body = m.error ? esc(m.text) : richText(m.text, names);
    const sources = (m.sources || [])
      .map(
        (s) =>
          `<span class="src">${esc(s.archivo)} <span class="sim">${Math.round(s.similitud * 1000) / 1000}</span></span>`
      )
      .join("");
    return `<div class="chat-msg bot ${m.error ? "is-error" : ""}">
      <span class="who">CVlight</span>
      <div class="bubble">${body}</div>
      ${sources ? `<div class="srcs">${sources}</div>` : ""}
    </div>`;
  }

  async function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (loading || streaming) return;

    const input = panelEl.querySelector("#chat-input");
    const text = input.value.trim();
    if (!text) return;

    const job = (CV.app.state.jobs || []).find((j) => j.id === jobId);
    if (!job) return;

    const analyzed = (job.cvs || []).some((c) => c.analizado);
    if (!analyzed) {
      CV.app.toast("Analizá los CVs primero.");
      return;
    }

    messages.push({ role: "user", text });
    input.value = "";
    loading = true;

    const sugg = panelEl.querySelector("#chat-suggestions");
    if (sugg) sugg.remove();

    statusText = "Leyendo los CVs…";
    renderLog();

    // Sin soporte de streaming, mismo camino de siempre (espera completa).
    if (typeof api.chatStream !== "function" || typeof TextDecoder === "undefined") {
      await askOnce(text);
      return;
    }

    await askStreaming(text);
  }

  // Camino clásico: una sola respuesta al final.
  async function askOnce(text) {
    try {
      const data = await api.chat(jobId, text, history);
      messages.push({ role: "bot", text: data.respuesta || "(sin respuesta)", sources: data.fuentes || [] });
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: data.respuesta || "" });
    } catch (err) {
      messages.push({ role: "bot", text: err.message, error: true });
    } finally {
      loading = false;
      renderLog();
      focusInput();
    }
  }

  // Camino con streaming: el texto aparece a medida que la IA lo genera.
  async function askStreaming(text) {
    const myJobId = jobId;
    let bot = null;
    let fuentes = [];
    const controller = new AbortController();
    if (chatAbort) {
      try {
        chatAbort.abort();
      } catch (e) {
        /* nada */
      }
    }
    chatAbort = controller;

    try {
      const result = await api.chatStream(myJobId, text, history, {
        onSources: (f) => {
          fuentes = f || [];
        },
        // El backend cambió de modelo antes de escribir: solo informamos.
        onNotice: (message) => {
          if (jobId !== myJobId || bot || !message) return;
          statusText = message;
          renderLog();
        },
        // Se cortó a mitad: el texto parcial no sirve, vaciamos y avisamos.
        onRestart: (message) => {
          if (jobId !== myJobId || !bot) return;
          bot.text = "";
          bot.note = message || "Reintentando con otro modelo…";
          updateStreamBubble(bot);
        },
        onDelta: (chunk) => {
          if (!chunk || jobId !== myJobId) return;
          if (!bot) {
            loading = false;
            streaming = true;
            bot = { role: "bot", text: "", note: null, sources: [], streaming: true };
            messages.push(bot);
            renderLog();
          }
          bot.note = null;
          bot.text += chunk;
          updateStreamBubble(bot);
        },
      }, { signal: controller.signal });
      if (result && result.fuentes) fuentes = result.fuentes;
    } catch (error) {
      // Cancelado porque el usuario cambió de vacante: no añadimos mensaje, no
      // mezclamos el historial y dejamos el estado limpio.
      if (error && (error.userAborted || error.name === "AbortError")) {
        if (jobId !== myJobId) {
          chatAbort = null;
          return;
        }
        // Abortado por cambio de vacante (o cancel interno)
        if (!bot) {
          chatAbort = null;
          return;
        }
        bot.streaming = false;
        bot.note = null;
        bot.sources = bot.sources || [];
        chatAbort = null;
        renderLog();
        focusInput();
        return;
      }
      if (!bot) {
        loading = false;
        streaming = false;
        messages.push({ role: "bot", text: error.message || "No se pudo responder.", error: true });
        renderLog();
        focusInput();
        chatAbort = null;
        return;
      }
      // Se cortó a mitad: dejamos lo que llegó y avisamos.
      bot.note = null;
      bot.text += (bot.text ? "\n\n" : "") + "⚠ " + (error.message || "Se cortó la respuesta.");
    } finally {
      loading = false;
      streaming = false;
    }

    if (chatAbort === controller) chatAbort = null;
    // Nunca escribimos la respuesta en otra vacante distinta a la que inició el pedido.
    if (jobId !== myJobId) {
      return;
    }
    if (!bot) {
      bot = { role: "bot", text: "", sources: [] };
      messages.push(bot);
    }
    bot.streaming = false;
    bot.note = null;
    bot.sources = fuentes;
    if (!bot.text) bot.text = "No tengo una respuesta para eso.";

    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: bot.text });

    renderLog();
    focusInput();
  }

  function focusInput() {
    const i = panelEl.querySelector("#chat-input");
    if (i) i.focus();
  }

  function emptyPanel(title, extra) {
    var fn = (CV.views.shared && CV.views.shared.emptyPanel) ? CV.views.shared.emptyPanel : CV.util.emptyBox;
    return fn(title, extra);
  }

  CV.views.chat = {
    mount,
    onShow() {
      if (chatAbort) {
        try {
          chatAbort.abort();
        } catch (e) {
          /* nada */
        }
        chatAbort = null;
      }
      loading = false;
      streaming = false;
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
