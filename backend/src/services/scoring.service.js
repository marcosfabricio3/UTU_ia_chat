const { generateResponse, embedTexts, friendlyAiError } = require("./gemini.service");
const { SYSTEM_INSTRUCTION, SCORE_SCHEMA } = require("../prompts/scoring.prompt");
const store = require("./store.service");

function buildVacancyText(job) {
  return `VACANTE: ${job.titulo}
DESCRIPCIÓN: ${job.descripcion}
REQUISITOS: ${job.requisitos || "no especificados"}

Evaluá el CV adjunto contra esta vacante y devolvé el JSON pedido.`;
}

// Puntúa un CV contra la vacante (manda el PDF directo a Gemini).
async function scoreCv(job, cv) {
  const text = await generateResponse(buildVacancyText(job), {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseSchema: SCORE_SCHEMA,
    files: [{ path: cv.path, mimeType: "application/pdf" }],
  });
  return JSON.parse(text);
}

// Analiza todos los CVs de la vacante.
// No se detiene ante el primer error: cada CV se puntúa de forma independiente
// y los que fallan se devuelven en "failed" para poder informarlos y reintentar.
// Se procesan con un pool de workers (concurrencia limitada) para no saturar la
// API de IA cuando hay muchos CVs.
async function analyzeJob(jobId, concurrency = 3) {
  const job = store.getJob(jobId);
  if (!job) return { job: null, failed: [] };

  const failed = [];
  const cvs = job.cvs.slice();
  let cursor = 0;

  async function worker() {
    while (cursor < cvs.length) {
      const cv = cvs[cursor++];
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
      } catch (error) {
        console.error("Error al analizar el CV", cv.archivo + ":", error.message);
        failed.push({ id: cv.id, archivo: cv.archivo, message: friendlyAiError(error) });
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, cvs.length); i++) workers.push(worker());
  await Promise.all(workers);

  return { job: store.getJob(jobId), failed };
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
