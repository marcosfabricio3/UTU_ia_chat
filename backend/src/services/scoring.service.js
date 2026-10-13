const { generateResponse, embedTexts, friendlyAiError } = require("./ai.service");
const { SYSTEM_INSTRUCTION, buildScoreSchema } = require("../prompts/scoring.prompt");
const { extractPdf } = require("./pdfText");
const store = require("./store.service");
const { modelChains, thinkingLevel, pdfMode } = require("../config");

function buildVacancyText(job) {
  return `VACANTE: ${job.titulo}
DESCRIPCIÓN: ${job.descripcion}
REQUISITOS: ${job.requisitos || "no especificados"}`;
}

// Pedido cuando el texto del CV lo extraemos localmente (motores de texto).
function buildTextMessage(job, cvText) {
  return `${buildVacancyText(job)}

CV (texto extraído del PDF):
"""
${cvText}
"""

Evaluá el CV contra esta vacante y devolvé el JSON pedido.`;
}

// Pedido cuando se manda el PDF nativo (escaneado o sin extracción fiable).
function buildPdfMessage(job) {
  return `${buildVacancyText(job)}

Evaluá el CV adjunto contra esta vacante y devolvé el JSON pedido.`;
}

// Los motores a veces envuelven el JSON en cercos de markdown.
function parseJsonResponse(text) {
  let s = String(text || "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();
  return JSON.parse(s);
}

// Puntúa un CV contra la vacante.
//
// Primero extrae el texto localmente (con reordenamiento de columnas): si hay
// capa de texto utilizable, el CV se manda como texto a cualquier motor (incluido
// Groq) y `texto_extraido` lo ponemos nosotros. Si no (escaneado), se manda el PDF
// nativo y el motor con visión (Gemini) devuelve el texto.
async function scoreCv(job, cv) {
  const extracted = await extractPdf(cv.path, { mode: pdfMode });
  const usingPdf = extracted.payload === "pdf";

  const text = await generateResponse(usingPdf ? buildPdfMessage(job) : buildTextMessage(job, extracted.text), {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseSchema: buildScoreSchema({ withExtractedText: usingPdf }),
    files: usingPdf ? [{ path: cv.path, mimeType: "application/pdf" }] : undefined,
    thinkingLevel: thinkingLevel.scoring,
    models: modelChains.scoring,
    label: "scoring",
  });

  const data = parseJsonResponse(text);
  if (!usingPdf) data.texto_extraido = extracted.text;
  return data;
}

// Analiza los CVs de una vacante.
// Por defecto procesa SOLO los que todavía no tienen score ("pendientes"): así,
// al subir un CV nuevo y volver a analizar, no se re-gasta cuota por los que ya
// estaban analizados. Un CV que falla NO se marca (queda sin score), por lo que
// un nuevo intento lo reintenta automáticamente.
// Con { force: true } se re-analiza todo (útil si cambió la vacante).
// No se detiene ante el primer error: cada CV se puntúa de forma independiente
// y los que fallan se devuelven en "failed" (con el motivo) para informarlos.
// Se procesan con un pool de workers (concurrencia limitada) para no saturar la
// API de IA cuando hay muchos CVs.
async function analyzeJob(jobId, { concurrency = 3, force = false } = {}) {
  const job = store.getJob(jobId);
  if (!job) return { job: null, failed: [], analyzedNow: 0, skipped: 0, pending: 0 };

  const todos = job.cvs.slice();
  const pendientes = force ? todos : todos.filter((c) => typeof c.score !== "number");
  const skipped = todos.length - pendientes.length;

  const failed = [];
  let analyzedNow = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pendientes.length) {
      const cv = pendientes[cursor++];
      try {
        const data = await scoreCv(job, cv);

        let vector = null;
        try {
          if (data.texto_extraido) {
            vector = (await embedTexts([data.texto_extraido]))[0];
          }
        } catch (e) {
          console.error("Embedding falló para", cv.id, e.message);
        }

        // updateCv es síncrono (read-modify-write completo): los workers no se
        // pisan entre sí porque no hay await dentro de la actualización.
        store.updateCv(jobId, cv.id, { ...data, vector, analizado: new Date().toISOString() });
        analyzedNow++;
      } catch (error) {
        console.error("Error al analizar el CV", cv.archivo + ":", error.message);
        failed.push({ id: cv.id, archivo: cv.archivo, message: friendlyAiError(error) });
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, pendientes.length); i++) workers.push(worker());
  await Promise.all(workers);

  const updated = store.getJob(jobId);
  const pending = updated ? updated.cvs.filter((c) => typeof c.score !== "number").length : 0;
  return { job: updated, failed, analyzedNow, skipped, pending };
}

// Arma el ranking ordenado + KPIs
function getRanking(jobId) {
  const job = store.getJob(jobId);
  if (!job) return null;

  const items = job.cvs
    .filter((c) => typeof c.score === "number")
    .map((c) => ({
      id: c.id,
      archivo: c.archivo,
      score: c.score,
      resumen: c.resumen,
      fortalezas: c.fortalezas,
      gaps: c.gaps,
      skills_match: c.skills_match,
      anios_experiencia: c.anios_experiencia,
      recomendacion: c.recomendacion,
    }))
    .sort((a, b) => b.score - a.score);

  const scores = items.map((i) => i.score);
  const promedio = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    total: items.length,
    promedio: Math.round(promedio * 10) / 10,
    ranking: items,
  };
}

module.exports = { analyzeJob, getRanking };
