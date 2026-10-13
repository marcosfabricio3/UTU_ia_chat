/* =========================================================================
   CVlight — views/vacantes.js
   Crear vacantes, seleccionarlas, subir CVs (PDF) y analizarlas.
   ========================================================================= */
window.CV = window.CV || {};
CV.views = CV.views || {};
(function (CV) {
  "use strict";

  const { esc, icon } = CV.util;
  const api = CV.api;

  let panelEl = null;   // panel de la vista: lista de vacantes
  let formEl = null;    // columna izquierda persistente: formulario "Nueva vacante"
  let expandedId = null;
  const status = {}; // id -> { type: 'loading'|'ok'|'error', text }
  const analyzing = new Set(); // ids con un análisis en curso (evita doble envío)
  const deleting = new Set();  // ids con un borrado en curso (evita doble envío)
  const shredding = new Set(); // ids de CV con un borrado en curso (evita doble envío)
  let suggesting = false;      // hay un "Autocompletar" en curso (evita doble envío)

  // Filtra un FileList dejando solo PDF (por MIME o por extensión).
  function pdfOnly(fileList) {
    return Array.from(fileList || []).filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
    );
  }

  // Normaliza los requisitos a viñetas: una por línea con "• " al frente (no la
  // duplica si la IA ya devolvió alguna línea con viñeta).
  function asBullets(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (/^[•\-*]\s/.test(l) ? l : "• " + l))
      .join("\n");
  }

  /* ---------------- Montaje (estructura fija) ---------------- */
  function mount(panel) {
    panelEl = panel;
    formEl = document.getElementById("sidebar") || panel;

    formEl.innerHTML = `
      <h2 id="h-nueva" class="panel-title">Nueva vacante</h2>
      <form id="form-vacante" novalidate>
        <div class="field">
          <label for="f-titulo">Título <span class="req" aria-hidden="true">*</span></label>
          <input id="f-titulo" name="titulo" autocomplete="off" required aria-describedby="e-titulo">
          <p class="msg error" id="e-titulo" hidden></p>
        </div>
        <div class="field">
          <label for="f-req">Requisitos</label>
          <textarea id="f-req" name="requisitos" rows="3" placeholder="Ej.: 3+ años en React, inglés técnico…"></textarea>
        </div>
        <div class="field">
          <label for="f-desc">Descripción <span class="req" aria-hidden="true">*</span></label>
          <textarea id="f-desc" name="descripcion" rows="5" required aria-describedby="e-desc"></textarea>
          <p class="msg error" id="e-desc" hidden></p>
        </div>
        <div class="btn-row">
          <button class="btn" type="submit">Crear vacante</button>
          <button class="link-btn autofill-btn" type="button" id="suggest-btn">
            <span>Autocompletar</span>
            <span class="af-ico" aria-hidden="true">${icon("sparkle")}${icon("sparkles")}</span>
          </button>
        </div>
        <p class="status" id="st-form" hidden></p>
      </form>`;

    panelEl.innerHTML = `
      <section class="block panel panel--board" aria-labelledby="h-vacantes">
        <h2 id="h-vacantes" class="panel-title">Vacantes <span class="sub" id="jobs-count"></span></h2>
        <ul id="job-list" class="job-list"></ul>
        <p id="jobs-empty" class="empty" hidden>
          <span class="empty-title">Todavía no hay vacantes</span>
          Creá la primera con el formulario de la izquierda.
        </p>
      </section>`;

    formEl.querySelector("#form-vacante").addEventListener("submit", onSubmit);
    formEl.querySelector("#suggest-btn").addEventListener("click", suggest);

    const list = panelEl.querySelector("#job-list");
    list.addEventListener("click", onListClick);
    list.addEventListener("change", onListChange);
  }

  /* ---------------- Render ---------------- */
  function render() {
    if (!panelEl) return;
    const jobs = CV.app.state.jobs || [];

    panelEl.querySelector("#jobs-count").textContent = jobs.length ? plural(jobs.length) : "";
    panelEl.querySelector("#jobs-empty").hidden = jobs.length > 0;

    const list = panelEl.querySelector("#job-list");
    list.innerHTML = jobs.map(jobCard).join("");

    // Preserva la vacante seleccionada como "activa" (para Ranking/Chat).
    if (expandedId && !jobs.some((j) => j.id === expandedId)) expandedId = null;
  }

  function plural(n) {
    return n === 1 ? "1 vacante" : n + " vacantes";
  }

  function jobCard(job) {
    const n = (job.cvs || []).length;
    const analyzed = (job.cvs || []).filter((c) => c.analizado).length;
    const pendientes = Math.max(0, n - analyzed); // CVs sin analizar (nuevos o que fallaron)
    const open = expandedId === job.id;
    const st = status[job.id];

    // Estado de la vacante según cuántos CVs quedan pendientes.
    let jState = "todo";
    let jText = "Sin analizar";
    if (n > 0 && pendientes === 0) {
      jState = "ok";
      jText = "Analizada";
    } else if (analyzed > 0) {
      jText = "Parcial"; // algunos sí, otros pendientes
    }

    // Solo mostramos "N sin analizar" cuando hay algo ya analizado (si no, el
    // badge "Sin analizar" ya lo dice).
    const metaPend = analyzed > 0 && pendientes > 0 ? " · " + pendientes + " sin analizar" : "";

    // El botón dice cuántos faltan; si ya está todo, ofrece re-analizar (force).
    const analyzeLabel =
      pendientes === 0
        ? "Re-analizar todos"
        : pendientes === n
          ? "Analizar CVs"
          : "Analizar CVs (" + pendientes + ")";
    const analyzeTitle =
      pendientes === 0
        ? "Volver a analizar todos los CVs de la vacante"
        : "Analizar solo los CVs que todavía no tienen resultado";

    // Cada chip de CV lleva al final un "shredder" (Lucide) que borra ESE CV.
    // La identidad va en data-* (ids reales), igual que en el resto de la vista.
    const cvChips = (job.cvs || [])
      .map(
        (c) =>
          `<span class="chip">` +
          `<span class="chip-name">${esc(c.archivo)}</span>` +
          `<button class="chip-x" type="button" data-action="shred" data-job="${esc(job.id)}" data-cv="${esc(c.id)}"` +
          ` aria-label="Eliminar el CV «${esc(c.archivo)}»" ${shredding.has(c.id) ? "disabled" : ""}>` +
          `${icon("shredder", 14)}</button>` +
          `</span>`
      )
      .join("");

    const statusHtml = st
      ? `<p class="status ${st.type === "error" ? "error" : st.type === "ok" ? "ok" : ""}">${
          st.type === "loading" ? '<span class="spinner" aria-hidden="true"></span>' : ""
        }${esc(st.text)}</p>`
      : "";

    return `
      <li class="job-card">
        <div class="job-head">
          <span class="j-main">
            <span class="jt">${esc(job.titulo)}</span>
            <span class="jm">${n} CV${n === 1 ? "" : "s"}${analyzed ? " · " + analyzed + " analizado" + (analyzed === 1 ? "" : "s") : ""}${metaPend}</span>
          </span>
          <button class="j-trash" type="button" data-action="delete" data-job="${esc(job.id)}"
                  aria-label="Eliminar la vacante «${esc(job.titulo)}»" ${deleting.has(job.id) ? "disabled" : ""}>${icon("trash")}</button>
          <span class="j-status ${jState}">${jText}</span>
          <button class="job-toggle" type="button" data-job="${esc(job.id)}" aria-expanded="${open}" aria-controls="jd-${esc(job.id)}">
            <span class="chev" aria-hidden="true">${icon(open ? "chevron-up" : "chevron-down")}</span>
            <span class="visually-hidden">Detalle de la vacante «${esc(job.titulo)}»</span>
          </button>
        </div>

        <div class="job-detail well" id="jd-${esc(job.id)}" ${open ? "" : "hidden"}>
          <p class="desc">${esc(job.descripcion)}</p>
          ${cvChips ? `<div class="chips">${cvChips}</div>` : ""}
          <input type="file" class="file" id="file-${esc(job.id)}" data-file="${esc(job.id)}"
                 accept="application/pdf" multiple aria-label="Subir CVs en PDF para esta vacante">
          <div class="btn-row">
            <button class="btn small" type="button" data-action="upload" data-job="${esc(job.id)}" disabled>Subir CVs</button>
            <button class="btn small ghost" type="button" data-action="analyze" data-job="${esc(job.id)}" title="${esc(analyzeTitle)}" ${n && !analyzing.has(job.id) ? "" : "disabled"}>${analyzeLabel}</button>
            ${
              analyzed
                ? `<button class="link-btn" type="button" data-action="ranking" data-job="${esc(job.id)}">Ver ranking</button>`
                : ""
            }
          </div>
          ${statusHtml}
        </div>
      </li>`;
  }

  /* ---------------- Eventos ---------------- */
  async function onSubmit(e) {
    e.preventDefault();
    const tituloEl = formEl.querySelector("#f-titulo");
    const descEl = formEl.querySelector("#f-desc");
    const titulo = tituloEl.value.trim();
    const descripcion = descEl.value.trim();
    const requisitos = formEl.querySelector("#f-req").value.trim();

    let ok = true;
    ok = setFieldError(tituloEl, "#e-titulo", titulo ? "" : "Indicá un título.") && ok;
    ok = setFieldError(descEl, "#e-desc", descripcion ? "" : "Indicá una descripción.") && ok;
    if (!ok) return;

    const st = formEl.querySelector("#st-form");
    setStatus(st, "loading", "Creando vacante…");
    try {
      const data = await api.createJob({ titulo, descripcion, requisitos });
      await CV.app.loadJobs();
      expandedId = data.job.id;
      CV.app.setActiveJob(data.job.id);
      render();
      formEl.querySelector("#form-vacante").reset();
      setStatus(st, "ok", "Vacante creada.");
      CV.app.toast("Vacante creada: " + titulo);
    } catch (err) {
      setStatus(st, "error", err.message);
    }
  }

  /* ---------------- Autocompletar con IA ---------------- */
  // Arma un borrador de la vacante con la IA a partir del título (y los
  // requisitos, si ya están escritos). Solo RELLENA el formulario: nunca crea la
  // vacante ni guarda nada. Si iba a pisar texto que ya existe, pide confirmación.
  async function suggest() {
    if (suggesting) return; // evita doble envío

    const tituloEl = formEl.querySelector("#f-titulo");
    const reqEl = formEl.querySelector("#f-req");
    const descEl = formEl.querySelector("#f-desc");
    const st = formEl.querySelector("#st-form");
    const btn = formEl.querySelector("#suggest-btn");

    const titulo = tituloEl.value.trim();
    if (!titulo) {
      setFieldError(tituloEl, "#e-titulo", "Indicá un título para que la IA sepa qué generar.");
      tituloEl.focus();
      return;
    }
    setFieldError(tituloEl, "#e-titulo", "");

    // Si ya escribió requisitos, los respetamos: solo pedimos la descripción.
    const requisitos = reqEl.value.trim();

    // Aplica un valor generado. Si el campo ya tiene texto distinto, confirma.
    async function apply(input, valor, etiqueta) {
      if (!valor) return false;
      if (input.value.trim() && input.value.trim() !== valor.trim()) {
        const ok = await CV.ui.confirm({
          title: "Reemplazar " + etiqueta,
          message: "Ya escribiste " + etiqueta + ". ¿Reemplazar por la sugerencia de la IA?",
          confirmLabel: "Reemplazar",
        });
        if (!ok) return false;
      }
      input.value = valor;
      return true;
    }

    suggesting = true;
    btn.disabled = true;
    setStatus(st, "loading", "Generando el borrador con la IA…");

    // Si tarda más de lo normal, avisamos (el corte real lo hace el timeout de api.js).
    const slowTimer = setTimeout(() => {
      if (suggesting) setStatus(st, "loading", "La IA está tardando más de lo normal…");
    }, 8000);

    try {
      const data = await api.suggestJob({ titulo, requisitos });
      const hechoReq = requisitos
        ? false // lo que el usuario ya escribió no se toca
        : await apply(reqEl, asBullets(data.requisitos), "los requisitos");
      const hechoDesc = await apply(descEl, data.descripcion, "la descripción");

      if (!hechoReq && !hechoDesc) {
        setStatus(st, "ok", "No se cambió nada.");
        return;
      }
      (hechoDesc ? descEl : reqEl).focus();
      setStatus(st, "ok", "Borrador listo. Revisalo y creá la vacante.");
    } catch (err) {
      setStatus(st, "error", err.message);
    } finally {
      clearTimeout(slowTimer);
      suggesting = false;
      btn.disabled = false;
    }
  }

  function onListClick(e) {
    // El basurero se evalúa ANTES que el toggle: su click nunca debe desplegar
    // la tarjeta. (Además es hermano del toggle, no descendiente.)
    const del = e.target.closest('[data-action="delete"]');
    if (del) {
      if (!del.disabled) removeJob(del.dataset.job);
      return;
    }

    const head = e.target.closest(".job-toggle");
    if (head) {
      const id = head.dataset.job;
      expandedId = expandedId === id ? null : id;
      if (expandedId === id) CV.app.setActiveJob(id);
      render();
      return;
    }

    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.job;
    const action = btn.dataset.action;

    if (action === "upload") uploadCvs(id, btn);
    else if (action === "analyze") analyze(id);
    else if (action === "shred") {
      if (!btn.disabled) shredCv(id, btn);
    }
    else if (action === "ranking") CV.app.showView("ranking");
  }

  function onListChange(e) {
    const input = e.target.closest("[data-file]");
    if (!input) return;
    const id = input.dataset.file;
    const card = input.closest(".job-detail");
    const uploadBtn = card.querySelector('[data-action="upload"]');

    const all = Array.from(input.files || []);
    const pdfs = pdfOnly(all);
    const rejected = all.length - pdfs.length;

    uploadBtn.disabled = pdfs.length === 0;
    if (!all.length) return;

    if (!pdfs.length) {
      status[id] = { type: "error", text: "Solo se aceptan archivos PDF." };
    } else {
      let text =
        pdfs.length + " CV" + (pdfs.length === 1 ? "" : "s") + " listo" + (pdfs.length === 1 ? "" : "s") + " para subir.";
      if (rejected) {
        text +=
          " Se " + (rejected === 1 ? "ignora" : "ignoran") + " " + rejected + " archivo" +
          (rejected === 1 ? "" : "s") + " que no " + (rejected === 1 ? "es" : "son") + " PDF.";
      }
      status[id] = { type: rejected ? "error" : "ok", text };
    }
    renderInlineStatus(card, status[id]);
  }

  /* ---------------- Acciones ---------------- */
  async function uploadCvs(id, btn) {
    const input = panelEl.querySelector('#file-' + CSS.escape(id));
    if (!input) return;
    const card = input.closest(".job-detail");
    const files = pdfOnly(input.files);

    if (!files.length) {
      status[id] = { type: "error", text: "Solo se aceptan archivos PDF." };
      renderInlineStatus(card, status[id]);
      return;
    }

    btn.disabled = true;
    status[id] = { type: "loading", text: "Subiendo " + files.length + " CV" + (files.length === 1 ? "" : "s") + "…" };
    renderInlineStatus(card, status[id]);

    try {
      const data = await api.uploadCvs(id, files);
      status[id] = { type: "ok", text: data.count + " CV" + (data.count === 1 ? "" : "s") + " cargado" + (data.count === 1 ? "" : "s") + "." };
      await CV.app.loadJobs();
      render();
      CV.app.toast("CVs cargados.");
    } catch (err) {
      status[id] = { type: "error", text: err.message };
      renderInlineStatus(card, status[id]);
      btn.disabled = false;
    }
  }

  async function analyze(id) {
    if (analyzing.has(id)) return; // evita doble envío (doble clic / Enter)

    // Decidimos el modo según el estado actual: si ya está todo analizado, el
    // botón "Re-analizar todos" fuerza el re-análisis; si no, solo se procesan
    // los pendientes (CVs nuevos o que fallaron antes).
    const job = (CV.app.state.jobs || []).find((j) => j.id === id);
    const cvs = (job && job.cvs) || [];
    const analyzed = cvs.filter((c) => c.analizado).length;
    const pendientes = Math.max(0, cvs.length - analyzed);
    const force = analyzed > 0 && pendientes === 0;
    const aAnalizar = pendientes || cvs.length;

    analyzing.add(id);
    status[id] = {
      type: "loading",
      text: force
        ? "Re-analizando todos los CVs con la IA… puede tardar un poco."
        : "Analizando " + aAnalizar + " CV" + (aAnalizar === 1 ? "" : "s") + " con la IA… puede tardar un poco.",
    };
    render();

    const nombre = (f) => (typeof f === "string" ? f : (f && f.archivo) || "un CV");

    try {
      const data = await api.analyze(id, force);
      const failed = data.failed || [];
      const now = data.analyzedNow || 0;
      const pending = typeof data.pending === "number" ? data.pending : failed.length;
      await CV.app.loadJobs();

      if (failed.length) {
        const motivo = (failed[0] && failed[0].message) || "";
        status[id] = {
          type: "error",
          text:
            "Se analizaron " + now + " CV" + (now === 1 ? "" : "s") + "." +
            (pending ? " Quedan " + pending + " sin analizar: " + failed.map(nombre).join(", ") + "." : "") +
            (motivo ? " " + motivo : "") +
            " Volvé a intentar para completar.",
        };
        CV.app.toast("Análisis incompleto: falló " + failed.length + " CV" + (failed.length === 1 ? "" : "s") + ".");
      } else if (now === 0) {
        status[id] = { type: "ok", text: data.message || "No había CVs nuevos para analizar." };
        CV.app.toast("No había CVs nuevos para analizar.");
      } else {
        status[id] = {
          type: "ok",
          text: "Listo. Se analizaron " + now + " CV" + (now === 1 ? "" : "s") + ". Ranking actualizado.",
        };
        CV.app.toast("CVs analizados.");
      }
    } catch (err) {
      // 502: no se pudo analizar ninguno. El error trae el motivo y la lista de
      // CVs que fallaron (err.data.failed), que espejamos para dar contexto.
      const failed = (err && err.data && err.data.failed) || [];
      const nombres = failed.map(nombre).join(", ");
      status[id] = {
        type: "error",
        text: err.message + (nombres ? " No se pudo con: " + nombres + "." : ""),
      };
    } finally {
      analyzing.delete(id);
      render();
    }
  }

  // Borra SOLO la vacante clickeada: la identidad viaja en data-job (nunca por
  // índice), así no puede tocar otra aunque cambie el orden o el estado.
  async function removeJob(id) {
    if (deleting.has(id)) return;
    const job = (CV.app.state.jobs || []).find((j) => j.id === id);
    if (!job) return;

    const ok = await CV.ui.confirm({
      title: "Eliminar vacante",
      message:
        "¿Eliminar «" + job.titulo + "»? Se borran sus CVs cargados y su ranking. " +
        "Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;

    const index = (CV.app.state.jobs || []).findIndex((j) => j.id === id);

    deleting.add(id);
    render(); // deshabilita el basurero mientras viaja la petición

    try {
      await api.deleteJob(id);
      forgetJob(id);

      await CV.app.loadJobs();
      deleting.delete(id);
      render();
      CV.app.toast("Vacante eliminada: " + job.titulo);
      restoreFocus(index);
    } catch (err) {
      deleting.delete(id);
      // 404 = ya no estaba (por ejemplo la borró otro proceso). No es un fallo
      // del usuario: alcanza con refrescar la lista.
      if (err.status === 404) {
        forgetJob(id);
        await CV.app.loadJobs();
        render();
        CV.app.toast("Esa vacante ya no existía; actualicé la lista.");
        return;
      }
      render();
      CV.app.toast("No se pudo eliminar: " + err.message);
    }
  }

  // Borra UN CV de la vacante clickeada: sale del ranking y del chat (el RAG se
  // arma en el backend desde job.cvs en cada consulta: no hay índice cacheado) y
  // se borra su PDF. Para recuperarlo hay que subirlo de nuevo. La identidad
  // viaja en data-job + data-cv (ids reales), nunca por índice.
  async function shredCv(jobId, btn) {
    const cvId = btn.dataset.cv;
    if (shredding.has(cvId)) return;

    const job = (CV.app.state.jobs || []).find((j) => j.id === jobId);
    const cv = job && (job.cvs || []).find((c) => c.id === cvId);
    if (!cv) return;

    const ok = await CV.ui.confirm({
      title: "Eliminar CV",
      message:
        "¿Eliminar «" + cv.archivo + "»? Se quita del ranking y del chat, y se borra el " +
        "archivo. Para volver a tenerlo hay que subirlo de nuevo.",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;

    const index = (job.cvs || []).findIndex((c) => c.id === cvId);
    shredding.add(cvId);
    btn.disabled = true; // se deshabilita el chip que viaja (no se re-renderiza)

    try {
      await api.deleteCv(jobId, cvId);
      shredding.delete(cvId);
      await CV.app.loadJobs();
      render();
      CV.app.toast("CV eliminado: " + cv.archivo);
      restoreCvFocus(jobId, index);
    } catch (err) {
      shredding.delete(cvId);
      // 404 = ya no estaba: no es un fallo del usuario, se refresca y se avisa.
      if (err.status === 404) {
        await CV.app.loadJobs();
        render();
        CV.app.toast("Ese CV ya no estaba; actualicé la lista.");
        return;
      }
      if (btn.isConnected) btn.disabled = false;
      CV.app.toast("No se pudo eliminar el CV: " + err.message);
    }
  }

  // Descarta el estado local de una vacante que ya no existe en el servidor.
  function forgetJob(id) {
    delete status[id];
    if (expandedId === id) expandedId = null;
    if (CV.app.state.activeJobId === id) CV.app.setActiveJob(null);
  }

  // Al desaparecer la fila el foco caería al <body>: se lo lleva al toggle
  // siguiente (o al anterior si era la última), y si no quedan vacantes, al
  // primer campo del formulario de creación.
  function restoreFocus(index) {
    const toggles = panelEl.querySelectorAll(".job-toggle");
    if (toggles.length) {
      const i = index >= 0 ? Math.min(index, toggles.length - 1) : 0;
      toggles[i].focus();
      return;
    }
    const first = formEl.querySelector("#f-titulo");
    if (first) first.focus();
  }

  // Igual que restoreFocus pero para el chip de un CV: al desaparecer el botón el
  // foco caería al <body>, así que va al shredder siguiente de esa vacante (o al
  // anterior si era el último) y, si ya no quedan CVs, al toggle de la tarjeta.
  function restoreCvFocus(jobId, index) {
    const buttons = panelEl.querySelectorAll('.chip-x[data-job="' + CSS.escape(jobId) + '"]');
    if (buttons.length) {
      const i = index >= 0 ? Math.min(index, buttons.length - 1) : 0;
      buttons[i].focus();
      return;
    }
    const toggle = panelEl.querySelector('.job-toggle[data-job="' + CSS.escape(jobId) + '"]');
    if (toggle) toggle.focus();
    else restoreFocus(0);
  }

  /* ---------------- Helpers ---------------- */
  function setFieldError(input, sel, msg) {
    const box = formEl.querySelector(sel);
    if (msg) {
      input.setAttribute("aria-invalid", "true");
      box.textContent = msg;
      box.hidden = false;
      return false;
    }
    input.removeAttribute("aria-invalid");
    box.hidden = true;
    return true;
  }

  function setStatus(node, type, text) {
    if (!node) return;
    node.hidden = false;
    node.className = "status" + (type === "error" ? " error" : type === "ok" ? " ok" : "");
    node.innerHTML =
      (type === "loading" ? '<span class="spinner" aria-hidden="true"></span>' : "") + esc(text);
  }

  function renderInlineStatus(card, st) {
    let node = card.querySelector(".status");
    if (!node) {
      node = document.createElement("p");
      node.className = "status";
      card.appendChild(node);
    }
    setStatus(node, st.type, st.text);
  }

  CV.views.vacantes = {
    mount,
    onShow() {
      render();
    },
  };
})(window.CV);
