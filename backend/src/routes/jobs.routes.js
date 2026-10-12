const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const store = require("../services/store.service");
const scoringService = require("../services/scoring.service");
const chatService = require("../services/chat.service");
const { friendlyAiError } = require("../services/gemini.service");
const { rateLimit } = require("../middleware/rate-limit");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "data", "cvs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
// para no mandarlos por HTTP en cada listado.
function publicCv(cv) {
  const out = { ...cv };
  delete out.vector;
  delete out.texto_extraido;
  delete out.path;
  return out;
}

function publicJob(job) {
  if (!job) return job;
  return { ...job, cvs: (job.cvs || []).map(publicCv) };
}

// Crear vacante
router.post("/", (req, res) => {
  const { titulo, descripcion, requisitos } = req.body;

  if (!titulo || !descripcion) {
    return res.status(400).json({
      success: false,
      message: "Título y descripción son obligatorios.",
    });
  }

  const job = store.createJob({ titulo, descripcion, requisitos });
  res.status(201).json({ success: true, job: publicJob(job) });
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
router.delete("/:id", (req, res) => {
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
      fs.unlinkSync(filePath);
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
router.delete("/:id/cvs/:cvId", (req, res) => {
  const removed = store.deleteCv(req.params.id, req.params.cvId);

  if (!removed) {
    return res.status(404).json({ success: false, message: "CV no encontrado." });
  }

  const filePath = removed.path || path.join(UPLOAD_DIR, `${removed.id}.pdf`);
  try {
    fs.unlinkSync(filePath);
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
router.post("/:id/cvs", loadJob, upload.array("cvs", 20), (req, res) => {
  const saved = [];
  try {
    for (const file of req.files || []) {
      // El nombre en disco ya lo puso multer (UUID.pdf); el id es ese UUID.
      const cv = {
        id: path.basename(file.filename, ".pdf"),
        archivo: file.originalname,
        path: file.path,
        creado: new Date().toISOString(),
      };

      store.addCv(req.job.id, cv);
      saved.push(cv);
    }
  } catch (error) {
    // Si algo falla a mitad de camino, borramos lo ya escrito para no dejar PDFs huérfanos.
    console.error("Error al guardar CVs:", error.message);
    for (const file of req.files || []) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        /* nada: el archivo ya no estaba */
      }
    }
    return res.status(500).json({ success: false, message: "No se pudieron guardar los CVs." });
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

  const force = !!(req.body && (req.body.force === true || req.body.force === "true"));

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
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "El mensaje no puede estar vacío." });
  }

  const hayAnalizados = req.job.cvs.some((c) => Array.isArray(c.vector));
  if (!hayAnalizados) {
    return res.status(400).json({
      success: false,
      message: "Primero tenés que analizar los CVs (POST /analyze).",
    });
  }

  // El historial lo manda el cliente: se acota (últimos 20 turnos, 4000 chars c/u).
  const history = (Array.isArray(req.body.history) ? req.body.history : [])
    .slice(-20)
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content || "").slice(0, 4000),
    }));

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

module.exports = router;