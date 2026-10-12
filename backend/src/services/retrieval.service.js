const { embedTexts } = require("./gemini.service");

// Similitud coseno entre dos vectores. Devuelve 0 si alguno es inválido o si
// no tienen la misma dimensión (evita NaN por comparar vectores de distinto tamaño).
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Recupera los CVs más parecidos a la pregunta (solo los que tienen vector).
async function retrieveRelevantCvs(job, question, topK = 5) {
  const conVector = job.cvs.filter((c) => Array.isArray(c.vector));
  if (!conVector.length) return [];

  const [qVector] = await embedTexts([question]);
  if (!Array.isArray(qVector)) return [];

  return conVector
    .filter((cv) => cv.vector.length === qVector.length)
    .map((cv) => ({ cv, similarity: cosineSimilarity(qVector, cv.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

module.exports = { retrieveRelevantCvs };
