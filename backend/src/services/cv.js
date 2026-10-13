// Reglas de dominio de un CV, independientes de la persistencia y del motor de IA.
//
// Un CV está "analizado" (y por lo tanto disponible para el ranking y el chat RAG)
// cuando tiene score Y vector: el vector es lo que permite recuperarlo en el chat.
// Tener score sin vector es un estado INCOMPLETO (p. ej. si falló el embedding), no
// "analizado". Esta es la única definición de la regla: el scoring, las rutas y la
// recuperación la comparten para no volver a divergir.
function isAnalyzed(cv) {
  return !!cv && typeof cv.score === "number" && Array.isArray(cv.vector);
}

module.exports = { isAnalyzed };
