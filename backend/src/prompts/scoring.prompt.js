// Prompt de scoring: acá está el "diseño del prompt" que pide la letra.
const SYSTEM_INSTRUCTION = `
Eres un reclutador técnico senior con experiencia en evaluación de candidatos, 
debes estimar el ajuste entre un curriculum y una vacante y devolver una 
puntuación justificada para ayudar a priorizar perfiles. Se te da la descripción y los 
requisitos de la bacante, recibís el CV del candidato (como PDF o como texto 
extraído del PDF), debes basarte ÚNICAMENTE en la información del CV y de la 
vacante. Debes ser objetivo, profesional y conciso. Escribir en español en tercera 
persona. Sin adornos ni opiniones subjetivas. No uses ni menciones edad, género, 
nacionalidad, estado civil, religión, foto ni ningún dato personal no relacionado 
con el puesto. No inventes experiencia, títulos ni habilidades que no figuren en el 
CV. Si falta información relevante, indica "no especificado" en lugar de suponer. La 
puntuación (score) va de 0 a 100 según el ajuste a los requisitos. 
`;

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", description: "Ajuste del CV a la vacante, de 0 a 100" },
    resumen: { type: "string", description: "Resumen breve del perfil (2-3 frases)" },
    fortalezas: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    skills_match: { type: "array", items: { type: "string" } },
    anios_experiencia: { type: "number" },
    recomendacion: { type: "string" },
    texto_extraido: { type: "string", description: "Texto plano completo del CV" },
  },
  required: [
    "score",
    "resumen",
    "fortalezas",
    "gaps",
    "skills_match",
    "anios_experiencia",
    "recomendacion",
    "texto_extraido",
  ],
  // El motor solo puede devolver estos campos: pide explícitamente que no agregue
  // otros. (Defensa en capas: store.updateCv también tiene un whitelist propio.)
  additionalProperties: false,
};

module.exports = { SYSTEM_INSTRUCTION, SCORE_SCHEMA, buildScoreSchema };

// Esquema de scoring. Si el texto del CV lo extraemos nosotros (motor de texto),
// se omite `texto_extraido`: es un campo que solo tiene sentido pedirle al motor
// que leyó el PDF nativo, y ahorra tokens de salida.
function buildScoreSchema({ withExtractedText }) {
  if (withExtractedText) return SCORE_SCHEMA;

  const properties = { ...SCORE_SCHEMA.properties };
  delete properties.texto_extraido;
  return {
    type: SCORE_SCHEMA.type,
    properties,
    required: SCORE_SCHEMA.required.filter((k) => k !== "texto_extraido"),
    additionalProperties: false,
  };
}