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

  async function request(path, options) {
    let res;
    try {
      res = await fetch(API_BASE + path, options);
    } catch (err) {
      throw new Error(
        "No se pudo conectar con el servidor. ¿Está corriendo el backend en http://localhost:3000?"
      );
    }

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      /* respuesta sin JSON */
    }

    if (!res.ok || (data && data.success === false)) {
      const err = new Error((data && data.message) || "Error " + res.status + " del servidor.");
      err.status = res.status; // permite distinguir 404 ("ya no existe") de un fallo real
      err.data = data; // payload completo (p. ej. la lista "failed") para quien lo necesite
      throw err;
    }
    return data;
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
    analyze: (id, force) =>
      request("/jobs/" + encodeURIComponent(id) + "/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!force }),
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
  };
})(window.CV);
