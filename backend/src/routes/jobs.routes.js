const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const store = require("../services/store.service");
const scoringService = require("../services/scoring.service");
const chatService = require("../services/chat.service");
const { generateResponse, friendlyAiError } = require("../services/ai.service");
const { isAnalyzed } = require("../services/cv");
const { SUGGEST_SYSTEM_INSTRUCTION, SUGGEST_SCHEMA } = require("../prompts/suggest.prompt");
const { rateLimit } = require("../middleware/rate-limit");
const { modelChains, thinkingLevel, thinkingBudget, maxOutputTokens } = require("../config");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "data", "cvs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// El mimetype lo declara el cliente y se puede falsificar: acá validamos la
// firma real del archivo ya en disco ("%PDF-" en los primeros bytes).
function empiezaConPdf(p) {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    return buf.toString("latin1") === "%PDF-";
  } catch {
    return false;
  }
}

// Ningún path llega a fs.unlink sin verificar que esté dentro de UPLOAD_DIR:
// aunque un registro viniera alterado, no borra archivos fuera de la carpeta.
function unlinkDeUploads(p) {
  const abs = path.resolve(p);
  const raiz = path.resolve(UPLOAD_DIR) + path.sep;
  if (!abs.startsWith(raiz)) return false;
  fs.unlinkSync(abs);
  return true;
}

// Los CVs se escriben en disco mientras se reciben (no en memoria): subir 20 PDFs
// no debe reservar ~200 MB de RAM. El nombre real es un UUID; el original queda en
// `archivo`.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10 MB por archivo, hasta 20
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo se permiten archivos PDF"));
  },
});

// Limita el análisis y el chat para no quemar la cuota de la IA.
const aiLimit = rateLimit({ max: 30 });

// Las mutaciones (crear vacantes, subir CVs, borrar) protegen el disco y la
// base: también llevan cupo, no solo las rutas de IA.
const writeLimit = rateLimit({ max: 30 });

// Carga la vacante de :id o responde 404. Va antes de multer para no escribir
// archivos en disco si la vacante no existe.
function loadJob(req, res, next) {
  const job = store.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, message: "Vacante no encontrada." });
  }
  req.job = job;
  next();
}

// Proyección pública de un candidato: quita los campos internos/pesados que el
// frontend no usa (el embedding, el texto extraído del PDF y la ruta en disco),
// para no mandarlos por HTTP en cada listado. Agrega `analizado` (la regla vive en
// services/cv.js) para que el frontend no la reimplemente con "¿tiene score?".
function publicCv(cv) {
  const out = { ...cv };
  delete out.vector;
  delete out.texto_extraido;
  delete out.path;
  out.analizado = isAnalyzed(cv);
  return out;
}

function publicJob(job) {
  if (!job) return job;
  return { ...job, cvs: (job.cvs || []).map(publicCv) };
}

// Mensaje de usuario para "Autocompletar": el título y, si vinieron, los
// requisitos (que la IA debe respetar).
function buildSuggestPrompt(titulo, requisitos) {
  return [
    `TÍTULO DE LA VACANTE: ${titulo}`,
    requisitos
      ? `REQUISITOS YA DEFINIDOS (respetalos, no los cambies; usalos como base de la descripción):\n${requisitos}`
      : "REQUISITOS: (no se dieron; redactá una lista breve, uno por línea)",
    "",
    "Devolvé únicamente el JSON pedido.",
  ].join("\n");
}

// Historial de chat que manda el cliente: se acota (últimos 20 turnos, 4000
// chars c/u). Lo comparten el chat normal y el de streaming.
function parseHistory(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(-20)
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content || "").slice(0, 4000),
    }));
}

// Crear vacante
router.post("/", writeLimit, (req, res) => {
  const { titulo, descripcion, requisitos } = req.body || {};

  if (!titulo || !descripcion) {
    return res.status(400).json({
      success: false,
      message: "Título y descripción son obligatorios.",
    });
  }

  const job = store.createJob({ titulo, descripcion, requisitos });
  res.status(201).json({ success: true, job: publicJob(job) });
});

// "Autocompletar": genera un borrador de vacante (requisitos + descripción) a
// partir del título. Si se envían requisitos, los RESPETA y solo redacta la
// descripción. Es puro texto: no toca el almacenamiento ni crea la vacante.
// Va antes de las rutas /:id para que "suggest" nunca se lea como un id.
router.post("/suggest", aiLimit, async (req, res) => {
  const titulo = String((req.body && req.body.titulo) || "").trim().slice(0, 200);
  const requisitos = String((req.body && req.body.requisitos) || "").trim().slice(0, 2000);

  if (!titulo) {
    return res.status(400).json({ success: false, message: "Indicá un título." });
  }

  try {
    const text = await generateResponse(buildSuggestPrompt(titulo, requisitos), {
      systemInstruction: SUGGEST_SYSTEM_INSTRUCTION,
      responseSchema: SUGGEST_SCHEMA,
      models: modelChains.suggest,
      thinkingLevel: thinkingLevel.suggest,
      thinkingBudget: thinkingBudget.suggest,
      maxOutputTokens,
      label: "suggest",
    });
    const data = JSON.parse(text);
    // Validación post-parse: nos aseguramos de que sean strings (la IA puede devolver
    // tipos inesperados; evitamos romper el frontend).
    res.json({
      success: true,
      requisitos: typeof data.requisitos === "string" ? data.requisitos.slice(0, 10000) : "",
      descripcion: typeof data.descripcion === "string" ? data.descripcion.slice(0, 10000) : "",
    });
  } catch (error) {
    console.error("Error al autocompletar la vacante:", error.message);
    res.status(502).json({
      success: false,
      message: friendlyAiError(error) || "No se pudo generar el borrador.",
    });
  }
});

// Listar vacantes
router.get("/", (req, res) => {
  res.json({ success: true, jobs: store.listJobs().map(publicJob) });
});

// Obtener una vacante
router.get("/:id", (req, res) => {
  const job = store.getJob(req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: "Vacante no encontrada." });
  }

  res.json({ success: true, job: publicJob(job) });
});

// Eliminar una vacante (y los PDFs de sus CVs)
router.delete("/:id", writeLimit, (req, res) => {
  // Primero el registro (fuente de verdad) y después los archivos: si la
  // limpieza del disco falla, la vacante igual queda eliminada (el PDF huérfano
  // es inofensivo, pero una vacante apuntando a archivos borrados no lo sería).
  const removed = store.deleteJob(req.params.id);

  if (!removed) {
    return res.status(404).json({ success: false, message: "Vacante no encontrada." });
  }

  const warnings = [];
  for (const cv of removed.cvs || []) {
    const filePath = cv.path || path.join(UPLOAD_DIR, `${cv.id}.pdf`);
    try {
      // Mismo containment que al servir el archivo: si el path del registro
      // apuntara fuera de la carpeta de CVs, no se borra nada.
      unlinkDeUploads(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") warnings.push(cv.archivo);
    }
  }
  if (warnings.length) console.warn("No se pudieron borrar los PDFs de", removed.id, warnings);

  res.json({ success: true, message: "Vacante eliminada.", id: removed.id });
});

// Eliminar UN CV de una vacante: sale del ranking y del chat (el RAG arma la
// recuperación desde job.cvs en cada request, no hay índice cacheado). Borra el
// registro (fuente de verdad) y después el PDF, igual que al borrar la vacante.
router.delete("/:id/cvs/:cvId", writeLimit, (req, res) => {
  const removed = store.deleteCv(req.params.id, req.params.cvId);

  if (!removed) {
    return res.status(404).json({ success: false, message: "CV no encontrado." });
  }

  const filePath = removed.path || path.join(UPLOAD_DIR, `${removed.id}.pdf`);
  try {
    unlinkDeUploads(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("No se pudo borrar el PDF", removed.archivo, error.message);
  }

  res.json({ success: true, message: "CV eliminado.", id: removed.id, archivo: removed.archivo });
});

// Servir el PDF de un CV (lo abre el botón del ranking en una pestaña nueva).
// Aunque el `path` sale del registro, se valida que apunte adentro de la carpeta
// de CVs: así una ruta arbitraria nunca se expone por accidente.
router.get("/:id/cvs/:cvId/file", (req, res) => {
  const job = store.getJob(req.params.id);
  const cv = job && (job.cvs || []).find((c) => c.id === req.params.cvId);

  if (!cv) {
    return res.status(404).json({ success: false, message: "CV no encontrado." });
  }

  const filePath = path.resolve(cv.path || path.join(UPLOAD_DIR, `${cv.id}.pdf`));
  const insideCvDir = filePath.startsWith(path.resolve(UPLOAD_DIR) + path.sep);

  if (!insideCvDir || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "El archivo del CV ya no está disponible." });
  }

  // "inline" → lo muestra el visor de PDF del navegador en vez de descargarlo.
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "inline; filename*=UTF-8''" + encodeURIComponent(cv.archivo || `${cv.id}.pdf`)
  );
  res.sendFile(filePath);
});

// Subir CVs (campo multipart "cvs", hasta 20 archivos)
router.post("/:id/cvs", writeLimit, loadJob, upload.array("cvs", 20), (req, res) => {
  const files = req.files || [];

  if (!files.length) {
    return res.status(400).json({ success: false, message: "No se recibió ningún archivo." });
  }

  // El mimetype lo declara el cliente y se puede falsificar: validamos la firma
  // real del archivo en disco. Si algún archivo no es PDF, se descarta todo el
  // lote (se borran los ya escritos) y no queda ningún registro.
  const noPdf = files.filter((f) => !empiezaConPdf(f.path));
  if (noPdf.length) {
    for (const f of files) {
      try {
        fs.unlinkSync(f.path);
      } catch (e) {
        /* nada: el archivo ya no estaba */
      }
    }
    const nombres = noPdf.map((f) => f.originalname).slice(0, 3).join(", ");
    return res.status(400).json({
      success: false,
      message: `Solo se aceptan PDFs (archivo${noPdf.length > 1 ? "s" : ""}: ${nombres}${noPdf.length > 3 ? ", …" : ""}).`,
    });
  }

  const saved = [];
  try {
    for (const file of files) {
      // El nombre en disco ya lo puso multer (UUID.pdf); el id es ese UUID.
      const cv = {
        id: path.basename(file.filename, ".pdf"),
        archivo: file.originalname,
        path: file.path,
        creado: new Date().toISOString(),
      };

      // addCv devuelve null si la vacante desapareció entre el loadJob y acá
      // (borrado concurrente): no seguimos guardando a media máquina.
      if (!store.addCv(req.job.id, cv)) {
        const e = new Error("La vacante ya no existe.");
        e.status = 409;
        throw e;
      }
      saved.push(cv);
    }
  } catch (error) {
    // Si algo falla a mitad de camino, revertimos los registros ya guardados y
    // borramos los PDFs escritos: registro y disco quedan consistentes.
    console.error("Error al guardar CVs:", error.message);
    for (const cv of saved) {
      try {
        store.deleteCv(req.job.id, cv.id);
      } catch (e) {
        /* nada */
      }
    }
    for (const file of files) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        /* nada: el archivo ya no estaba */
      }
    }
    return res.status(error.status || 500).json({
      success: false,
      message: error.status === 409 ? error.message : "No se pudieron guardar los CVs.",
    });
  }

  res.status(201).json({ success: true, count: saved.length, cvs: saved.map(publicCv) });
});

// Analizar los CVs de una vacante.
// Por defecto solo procesa los CVs "pendientes" (sin score): agregar uno nuevo y
// volver a analizar no re-gasta cuota por los ya analizados. Con body { force:
// true } se re-analiza todo. Los que fallan quedan sin score y se reintentan solos.
router.post("/:id/analyze", aiLimit, loadJob, async (req, res) => {
  if (!req.job.cvs.length) {
    return res.status(400).json({ success: false, message: "La vacante no tiene CVs." });
  }

  const body = req.body || {};
  const force = !!(body.force === true || body.force === "true");

  try {
    const { job: updated, failed, analyzedNow, skipped, pending } =
      await scoringService.analyzeJob(req.params.id, { force });

    // La vacante puede haberse borrado mientras corría el análisis.
    if (!updated) {
      return res.status(404).json({ success: false, message: "La vacante ya no existe." });
    }

    const failedPublic = failed.map((f) => ({ archivo: f.archivo, message: f.message }));

    // Nada que hacer: no había CVs pendientes. No es un error.
    if (analyzedNow === 0 && failed.length === 0) {
      return res.json({
        success: true,
        job: publicJob(updated),
        analyzedNow: 0,
        skipped,
        pending,
        failed: [],
        message: "Todos los CVs ya estaban analizados.",
      });
    }

    // Se intentó analizar y no se pudo ninguno: error con mensaje accionable.
    if (analyzedNow === 0) {
      return res.status(502).json({
        success: false,
        job: publicJob(updated),
        analyzedNow: 0,
        skipped,
        pending,
        failed: failedPublic,
        message: failed[0].message || "No se pudieron analizar los CVs.",
      });
    }

    // Éxito (total o parcial): informamos qué CVs quedaron pendientes y por qué.
    res.json({
      success: true,
      job: publicJob(updated),
      analyzedNow,
      skipped,
      pending,
      failed: failedPublic,
    });
  } catch (error) {
    console.error("Error al analizar:", error.message);
    res.status(500).json({
      success: false,
      message: friendlyAiError(error) || "No se pudieron analizar los CVs.",
    });
  }
});

// Ranking + KPIs de una vacante
router.get("/:id/ranking", (req, res) => {
  const ranking = scoringService.getRanking(req.params.id);
  if (!ranking) {
    return res.status(404).json({ success: false, message: "Vacante no encontrada." });
  }
  res.json({ success: true, ...ranking });
});

// Chat RAG sobre los CVs de una vacante
router.post("/:id/chat", aiLimit, loadJob, async (req, res) => {
  const { message } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "El mensaje no puede estar vacío." });
  }

  const hayAnalizados = req.job.cvs.some(isAnalyzed);
  if (!hayAnalizados) {
    return res.status(400).json({
      success: false,
      message: "Primero tenés que analizar los CVs (POST /analyze).",
    });
  }

  const history = parseHistory(req.body && req.body.history);

  try {
    const result = await chatService.chat(req.params.id, message, history);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error en chat:", error.message);
    res.status(error.status === 429 || error.status === 503 ? error.status : 500).json({
      success: false,
      message: friendlyAiError(error) || "No se pudo responder la pregunta.",
    });
  }
});

// Chat RAG en streaming (Server-Sent Events): la respuesta se ve "escribiéndose".
// Secuencia de eventos: `sources` (CVs citados) → muchos `delta` (fragmentos de
// texto) → `done`. Ante un error a mitad de camino, un evento `error`.
//
// Failover: si el modelo se cae a mitad de la respuesta, se emite `notice`
// (cambio silencioso, aún sin texto) o `restart` (había texto parcial: el cliente
// debe vaciar la burbuja y seguir); después siguen más `delta` con otro modelo.
// La recuperación (embedding) se hace ANTES de abrir el stream: si falla, todavía
// se puede responder un JSON con status HTTP normal.
router.post("/:id/chat/stream", aiLimit, loadJob, async (req, res) => {
  const { message } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "El mensaje no puede estar vacío." });
  }

  const hayAnalizados = req.job.cvs.some(isAnalyzed);
  if (!hayAnalizados) {
    return res.status(400).json({
      success: false,
      message: "Primero tenés que analizar los CVs (POST /analyze).",
    });
  }

  const history = parseHistory(req.body && req.body.history);

  let prepared;
  try {
    prepared = await chatService.prepare(req.params.id, message, history);
  } catch (error) {
    console.error("Error al recuperar el contexto del chat:", error.message);
    return res.status(502).json({
      success: false,
      message: friendlyAiError(error) || "No se pudo responder la pregunta.",
    });
  }

  if (!prepared) {
    return res.status(404).json({ success: false, message: "La vacante ya no existe." });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // desactiva el buffer de proxies intermedios
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Si el cliente se desconecta (cierra la pestaña, cambia de vacante), cortamos
  // el consumo del stream: seguir generando tokens no lo paga nadie.
  let clienteFuera = false;
  res.on("close", () => {
    clienteFuera = true;
  });

  send("sources", prepared.fuentes);
  try {
    for await (const evt of chatService.chatStream(prepared)) {
      if (clienteFuera) break; // el break invoca el return del generador (libera recursos)
      if (evt.type === "delta") send("delta", evt.text);
      else if (evt.type === "notice") send("notice", { message: evt.message });
      else if (evt.type === "restart") send("restart", { message: evt.message, model: evt.model });
    }
    if (clienteFuera) return; // no emitimos done a un cliente que ya no está
    send("done", { ok: true });
  } catch (error) {
    if (clienteFuera) return;
    console.error("Error en chat (stream):", error.message);
    send("error", { message: friendlyAiError(error) || "No se pudo responder la pregunta." });
  } finally {
    res.end();
  }
});

module.exports = router;