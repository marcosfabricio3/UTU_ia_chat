function sanitizeName(name) {
  // Evita saltos de línea/inyecciones a través del nombre original del archivo
  return String(name || "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .trim()
    .slice(0, 80);
}

function buildVacancyText(job) {
  return `VACANTE: ${job.titulo}
DESCRIPCIÓN: ${job.descripcion}
REQUISITOS: ${job.requisitos || "no especificados"}`;
}

// Delimita el texto del CV para ayudar a la IA a distinguir datos de instrucciones.
function delimitCvText(cvText) {
  const safe = String(cvText || "");
  return `### DATOS_CV_INICIO ###\n${safe}\n### DATOS_CV_FIN ###`;
}

// Pedido cuando el texto del CV lo extraemos localmente (motores de texto).
function buildTextMessage(job, cvText) {
  return `${buildVacancyText(job)}

CV (texto extraído del PDF):
"""
${delimitCvText(cvText)}
"""
Evaluá el CV contra esta vacante y devolvé el JSON pedido.`;
}

// Pedido cuando se manda el PDF nativo (escaneado o sin extracción fiable).
function buildPdfMessage(job) {
  return `${buildVacancyText(job)}

Evaluá el CV adjunto contra esta vacante y devolvé el JSON pedido.`;
}

// Validación post-parse: asegura tipos mínimos del JSON de la IA.
function validateScoreData(data) {
  if (!data || typeof data !== "object") throw new Error("Respuesta del modelo inválida (no es un objeto).");
  if (typeof data.score !== "number" || Number.isNaN(data.score)) throw new Error("Respuesta del modelo inválida (score no numérico).");
  data.score = Math.max(0, Math.min(100, Math.round(data.score)));
  if (typeof data.resumen !== "string") data.resumen = "";
  if (typeof data.recomendacion !== "string") data.recomendacion = "";
  if (typeof data.anios_experiencia !== "number" || Number.isNaN(data.anios_experiencia)) data.anios_experiencia = 0;
  const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  data.fortalezas = arr(data.fortalezas);
  data.gaps = arr(data.gaps);
  data.skills_match = arr(data.skills_match);
  if (typeof data.texto_extraido === "string") {
    data.texto_extraido = data.texto_extraido.slice(0, 200000);
  }
  return data;
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
    thinkingBudget: thinkingBudget.scoring,
    maxOutputTokens,
    models: modelChains.scoring,
    label: "scoring",
  });

  let data = parseJsonResponse(text);
  if (!usingPdf) data.texto_extraido = extracted.text;
  data = validateScoreData(data);
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
  // "Pendiente" = todavía no está analizado (ver services/cv.js). Cubre tanto al
  // CV nuevo como al que quedó a medias (p. ej. si falló el embedding).
  const pendientes = force ? todos : todos.filter((c) => !isAnalyzed(c));
  const skipped = todos.length - pendientes.length;

  const failed = [];
  let analyzedNow = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pendientes.length) {
      const cv = pendientes[cursor++];
      try {
        // Si ya estaba puntuado y solo falta el vector (p. ej. falló el embedding en
        // un intento previo), se reutiliza el texto guardado: NO se gasta cuota de
        // scoring, solo se vuelve a calcular el embedding.
        const data = typeof cv.score === "number" && cv.texto_extraido ? cv : await scoreCv(job, cv);

        if (!data.texto_extraido) {
          const error = new Error("El análisis no devolvió texto del CV para indexar.");
          error.userFacing = true;
          throw error;
        }

        // El vector es imprescindible para el chat: si el embedding falla, el CV NO
        // queda como analizado (sigue pendiente) y el error se informa.
        const vector = (await embedTexts([data.texto_extraido]))[0];

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
  const pending = updated ? updated.cvs.filter((c) => !isAnalyzed(c)).length : 0;
  return { job: updated, failed, analyzedNow, skipped, pending };
}

// Arma el ranking ordenado + KPIs
function getRanking(jobId) {
  const job = store.getJob(jobId);
  if (!job) return null;

  const items = job.cvs
    .filter(isAnalyzed)
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
