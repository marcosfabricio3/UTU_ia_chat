/* =========================================================================
   CVlight — api.js
   Capa fina sobre fetch hacia el backend (Express en :3000).
   Funciona servido por HTTP o abierto con file:// (CORS abierto en el backend).
   ========================================================================= */
window.CV = window.CV || {};
(function (CV) {
  "use strict";

  // Si la app se sirve desde el mismo :3000, usamos rutas relativas; si no
  // (file:// o un server estático en otro puerto), apuntamos al backend local.
  const sameOrigin = location.hostname === "localhost" && location.port === "3000";
  const API_BASE = sameOrigin ? "/api" : "http://localhost:3000/api";

  // Corta las esperas: si la IA no responde en este tiempo, avisamos en vez de
  // dejar la UI "cargando" para siempre. 0 desactiva el corte.
  const DEFAULT_TIMEOUT_MS = 120000;
  const OFFLINE_MSG =
    "No se pudo conectar con el servidor. ¿Está corriendo el backend en http://localhost:3000?";
  const TIMEOUT_MSG = "La IA tardó demasiado en responder. Probá de nuevo.";

  async function request(path, options) {
    const opts = options || {};
    const timeoutMs = opts.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : opts.timeoutMs;
    const fetchOpts = { ...opts };
    delete fetchOpts.timeoutMs;

    let res;
    try {
      const controller = new AbortController();
      const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        res = await fetch(API_BASE + path, { ...fetchOpts, signal: controller.signal });
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error(TIMEOUT_MSG);
      throw new Error(OFFLINE_MSG);
    }

    const data = await res.json().catch(() => null);

    if (!res.ok || (data && data.success === false)) {
      const err = new Error((data && data.message) || "Error " + res.status + " del servidor.");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---- Server-Sent Events (chat en streaming) ----
  // Parsear un bloque SSE ("event: x\ndata: {...}") a { event, data }.
  function parseSseBlock(bloque) {
    let event = "message";
    let data = "";
    for (const linea of bloque.split("\n")) {
      if (linea.startsWith("event:")) event = linea.slice(6).trim();
      else if (linea.startsWith("data:")) data += linea.slice(5).trim();
    }
    if (!data) return null;
    try {
      return { event, data: JSON.parse(data) };
    } catch (e) {
      return { event, data };
    }
  }

  // Chat en streaming: llama a `onDelta(fragmento)` a medida que llega el texto
  // y resuelve con { fuentes } al terminar. Usa fetch + ReadableStream (no
  // EventSource, porque necesitamos POST con body).
  async function chatStream(id, message, history, handlers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let res;

    try {
      res = await fetch(API_BASE + "/jobs/" + encodeURIComponent(id) + "/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error && error.name === "AbortError") throw new Error(TIMEOUT_MSG);
      throw new Error(OFFLINE_MSG);
    }

    if (!res.ok) {
      clearTimeout(timer);
      const data = await res.json().catch(() => null);
      const err = new Error((data && data.message) || "Error " + res.status + " del servidor.");
      err.status = res.status;
      err.data = data;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fuentes = [];

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const bloque = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const evt = parseSseBlock(bloque);
          if (!evt) continue;

          if (evt.event === "sources") {
            fuentes = evt.data || [];
            if (handlers.onSources) handlers.onSources(fuentes);
          } else if (evt.event === "delta") {
            if (handlers.onDelta) handlers.onDelta(String(evt.data || ""));
          } else if (evt.event === "error") {
            throw new Error((evt.data && evt.data.message) || "No se pudo responder la pregunta.");
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    return { fuentes };
  }

  CV.api = {
    listJobs: () => request("/jobs"),
    createJob: (payload) =>
      request("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    uploadCvs: (id, files) => {
      const fd = new FormData();
      for (const f of files) fd.append("cvs", f);
      return request("/jobs/" + encodeURIComponent(id) + "/cvs", { method: "POST", body: fd });
    },
    // El análisis manda los PDFs a la IA y puede tardar bastante.
    analyze: (id, force) =>
      request("/jobs/" + encodeURIComponent(id) + "/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!force }),
        timeoutMs: 600000,
      }),
    // "Autocompletar": la IA redacta requisitos/descripción a partir del título.
    suggestJob: (payload) =>
      request("/jobs/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    deleteJob: (id) => request("/jobs/" + encodeURIComponent(id), { method: "DELETE" }),
    deleteCv: (jobId, cvId) =>
      request(
        "/jobs/" + encodeURIComponent(jobId) + "/cvs/" + encodeURIComponent(cvId),
        { method: "DELETE" }
      ),
    // URL del PDF de un CV, para abrirlo en una pestaña nueva (no es un fetch).
    cvFileUrl: (jobId, cvId) =>
      API_BASE +
      "/jobs/" + encodeURIComponent(jobId) +
      "/cvs/" + encodeURIComponent(cvId) +
      "/file",
    ranking: (id) => request("/jobs/" + encodeURIComponent(id) + "/ranking"),
    chat: (id, message, history) =>
      request("/jobs/" + encodeURIComponent(id) + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      }),
    chatStream,
  };
})(window.CV);
