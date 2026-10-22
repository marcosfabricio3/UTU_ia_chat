/* =========================================================================
   CVlight â€” api.js
   Capa fina sobre fetch hacia el backend (Express en :3000).
   Funciona servido por HTTP o abierto con file:// (CORS abierto en el backend).
   ========================================================================= */
window.CV = window.CV || {};
(function (CV) {
  "use strict";

  // Si la app se sirve desde el mismo :3000, usamos rutas relativas; si no
  // (file:// o un server estÃ¡tico en otro puerto), apuntamos al backend local.
    const RENDER_API = (window.CV_API_BASE) || (window.API_BASE) || "https://utu-ia-chat-api.onrender.com/api";
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isVercel = window.CV_API_BASE
    ? true
    : location.hostname.indexOf(".vercel.app") !== -1;

  let API_BASE = "/api";
  if (isVercel) {
    API_BASE = RENDER_API;
  } else if (isLocal) {
    if (location.port === "3000" || location.pathname.includes("/app")) API_BASE = "/api";
    else API_BASE = location.origin + "/api";
  } else if (location.protocol === "http:" || location.protocol === "https:") {
    if (location.pathname.includes("/app")) API_BASE = location.origin + "/api";
    else API_BASE = "/api";
  } else {
    API_BASE = RENDER_API;
  }

  let apiToken = null;
  let tokenPromise = null;

  async function ensureToken() {
    if (apiToken) return apiToken;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      try {
        const base = API_BASE.replace(/\/api$/, ""); const res = await fetch(base + "/api/session", {
          method: "GET",
          credentials: isLocal ? "same-origin" : "omit",
        });
        const data = await res.json().catch(() => null);
        if (data && data.success && data.token) {
          apiToken = String(data.token);
          return apiToken;
        }
      } catch (e) {
        /* sin token, seguimos (modo legacy) */
      }
      return null;
    })();
    try {
      const t = await tokenPromise;
      return t;
    } finally {
      tokenPromise = null;
    }
  }

  // Corta las esperas: si la IA no responde en este tiempo, avisamos en vez de
  // dejar la UI "cargando" para siempre. 0 desactiva el corte.
  const DEFAULT_TIMEOUT_MS = 120000;
  // El chat en streaming puede encadenar varios modelos: el backend corta a los
  // 120s, pero un intento en curso puede estirarse; damos margen de sobra.
  const STREAM_TIMEOUT_MS = 180000;
  const OFFLINE_MSG =
    "No se pudo conectar con el servidor. Â¿EstÃ¡ corriendo el backend en http://localhost:3000?";
  const TIMEOUT_MSG = "La IA tardÃ³ demasiado en responder. ProbÃ¡ de nuevo.";

  async function request(path, options) {
    const opts = options || {};
    const timeoutMs = opts.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : opts.timeoutMs;
    const fetchOpts = { ...opts };
    delete fetchOpts.timeoutMs;

    // Adjuntamos el token de sesiÃ³n si lo tenemos (protecciÃ³n Fase B).
    const token = await ensureToken();
    if (token) {
      fetchOpts.headers = fetchOpts.headers || {};
      if (!(fetchOpts.headers instanceof Headers)) {
        fetchOpts.headers = { ...fetchOpts.headers, "X-API-Key": token };
      } else {
        fetchOpts.headers.set("X-API-Key", token);
      }
    }

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
      throw new Error("No se pudo conectar con el servidor. Revisá la conexión.");
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
  //
  // Failover: si el backend cambia de modelo en el medio, avisa con `notice`
  // (cambio silencioso, todavÃ­a sin texto) o `restart` (el texto parcial ya no
  // sirve: el cliente debe vaciar la burbuja). DespuÃ©s siguen mÃ¡s `delta`.
  async function chatStream(id, message, history, handlers = {}, opts = {}) {
    const external = (opts && opts.signal) || null;
    const controller = new AbortController();
    const onExtAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", onExtAbort, { once: true });
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STREAM_TIMEOUT_MS);
    let res;

    const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
    const token = await ensureToken();
    if (token) headers["X-API-Key"] = token;

    try {
      res = await fetch(API_BASE + "/jobs/" + encodeURIComponent(id) + "/chat/stream", {
        method: "POST",
        headers,
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
    } catch (error) {
      if (external) external.removeEventListener("abort", onExtAbort);
      clearTimeout(timer);
      if (error && error.name === "AbortError") {
        if (external && external.aborted && !timedOut) {
          const e = new Error("abortado por el usuario");
          e.name = "AbortError";
          e.userAborted = true;
          throw e;
        }
        throw new Error(TIMEOUT_MSG);
      }
      throw new Error("No se pudo conectar con el servidor. Revisá la conexión.");
    }

    if (!res.ok) {
      if (external) external.removeEventListener("abort", onExtAbort);
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
          } else if (evt.event === "notice") {
            if (handlers.onNotice) handlers.onNotice(String((evt.data && evt.data.message) || ""));
          } else if (evt.event === "restart") {
            if (handlers.onRestart) handlers.onRestart(String((evt.data && evt.data.message) || ""));
          } else if (evt.event === "error") {
            throw new Error((evt.data && evt.data.message) || "No se pudo responder la pregunta.");
          }
        }
      }
    } catch (error) {
      if (error && error.name === "AbortError" && external && external.aborted && !timedOut) {
        const e = new Error("abortado por el usuario");
        e.name = "AbortError";
        e.userAborted = true;
        throw e;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (external) external.removeEventListener("abort", onExtAbort);
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
    // El anÃ¡lisis manda los PDFs a la IA y puede tardar bastante.
    analyze: (id, force) =>
      request("/jobs/" + encodeURIComponent(id) + "/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!force }),
        timeoutMs: 600000,
      }),
    // "Autocompletar": la IA redacta requisitos/descripciÃ³n a partir del tÃ­tulo.
    // Puede encadenar modelos si el primero estÃ¡ saturado, por eso damos margen.
    suggestJob: (payload) =>
      request("/jobs/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 180000,
      }),
    deleteJob: (id) => request("/jobs/" + encodeURIComponent(id), { method: "DELETE" }),
    deleteCv: (jobId, cvId) =>
      request(
        "/jobs/" + encodeURIComponent(jobId) + "/cvs/" + encodeURIComponent(cvId),
        { method: "DELETE" }
      ),
    // URL del PDF de un CV, para abrirlo en una pestaÃ±a nueva (no es un fetch).
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

