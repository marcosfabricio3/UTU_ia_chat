const { generateResponse, generateResponseStream } = require("./gemini.service");
const { retrieveRelevantCvs } = require("./retrieval.service");
const { CHAT_SYSTEM_INSTRUCTION } = require("../prompts/chat.prompt");
const store = require("./store.service");
const { modelChains, thinkingLevel } = require("../config");

// Opciones de latencia del chat: cadena de modelos (con failover) y razonamiento
// bajo (es RAG: el contexto ya está dado).
const CHAT_OPTS = {
  systemInstruction: CHAT_SYSTEM_INSTRUCTION,
  models: modelChains.chat,
  thinkingLevel: thinkingLevel.chat,
  label: "chat",
};

// Arma el bloque de contexto con la vacante y los candidatos recuperados.
function buildContext(job, matches) {
  const bloques = matches
    .map((m, i) => {
      const c = m.cv;
      const texto = (c.texto_extraido || "").slice(0, 4000);
      return `--- Candidato ${i + 1} ---
Archivo: ${c.archivo}
Score: ${c.score}
Resumen: ${c.resumen || "no especificado"}
Skills: ${(c.skills_match || []).join(", ") || "no especificado"}
CV: ${texto}`;
    })
    .join("\n\n");

  return `VACANTE: ${job.titulo}
DESCRIPCIÓN: ${job.descripcion}
REQUISITOS: ${job.requisitos || "no especificados"}

CANDIDATOS DISPONIBLES:
${bloques}`;
}

// Arma las fuentes citadas (los CVs recuperados) que devuelve el chat.
function fuentesDe(matches) {
  return matches.map((m) => ({
    id: m.cv.id,
    archivo: m.cv.archivo,
    score: m.cv.score,
    similitud: Math.round(m.similarity * 1000) / 1000,
  }));
}

// Recupera los candidatos relevantes (1 llamada de embedding) y arma el prompt
// completo. Se separa del chat para que la ruta SSE resuelva la recuperación
// ANTES de abrir el stream. Devuelve null si la vacante no existe.
async function prepare(jobId, question, history = []) {
  const job = store.getJob(jobId);
  if (!job) return null;

  // 1. Recuperar los CVs más relevantes a la pregunta
  const matches = await retrieveRelevantCvs(job, question, 5);

  // 2. Armar el prompt: contexto + historial + pregunta
  const historial = history
    .map((h) => `${h.role === "user" ? "Reclutador" : "Asistente"}: ${h.content}`)
    .join("\n");

  const prompt = `${buildContext(job, matches)}

${historial ? `HISTORIAL:\n${historial}\n` : ""}
PREGUNTA DEL RECLUTADOR: ${question}`;

  return { prompt, fuentes: fuentesDe(matches) };
}

// Chat sin streaming (fallback): espera la respuesta completa.
async function chat(jobId, question, history = []) {
  const prepared = await prepare(jobId, question, history);
  if (!prepared) return null;

  const respuesta = await generateResponse(prepared.prompt, CHAT_OPTS);

  return { respuesta, fuentes: prepared.fuentes };
}

// Chat en streaming: cede los eventos del modelo (delta / notice / restart) a
// medida que llegan, para que la ruta los traduzca a SSE.
async function* chatStream(prepared) {
  yield* generateResponseStream(prepared.prompt, CHAT_OPTS);
}

module.exports = { prepare, chat, chatStream };
