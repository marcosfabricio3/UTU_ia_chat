const { generateResponse } = require("./gemini.service");
const { retrieveRelevantCvs } = require("./retrieval.service");
const { CHAT_SYSTEM_INSTRUCTION } = require("../prompts/chat.prompt");
const store = require("./store.service");

// Arma el bloque de contexto con los candidatos recuperados
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

async function chat(jobId, question, history = []) {
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

  // 3. Generar la respuesta
  const respuesta = await generateResponse(prompt, {
    systemInstruction: CHAT_SYSTEM_INSTRUCTION,
  });

  // 4. Devolver fuentes citadas
  const fuentes = matches.map((m) => ({
    id: m.cv.id,
    archivo: m.cv.archivo,
    score: m.cv.score,
    similitud: Math.round(m.similarity * 1000) / 1000,
  }));

  return { respuesta, fuentes };
}

module.exports = { chat };