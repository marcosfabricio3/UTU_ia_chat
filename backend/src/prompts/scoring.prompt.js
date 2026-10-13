// Prompt de scoring: acá está el "diseño del prompt" que pide la letra.
const SYSTEM_INSTRUCTION = `
Sos un reclutador técnico senior con más de 10 años de experiencia evaluando candidatos.
Tu OBJETIVO es evaluar qué tan bien encaja un CV con una vacante concreta y devolver una
puntuación objetiva y justificada que ayude a priorizar candidatos.

CONTEXTO:
- Recibís la descripción y los requisitos de la vacante.
- Recibís el CV del candidato (como PDF o como texto extraído del PDF).
- Debés basarte ÚNICAMENTE en la información del CV y de la vacante.

ESTILO:
- Objetivo, profesional y conciso. Escribí en español, en tercera persona.
- Sin adornos ni opiniones subjetivas.

REGLAS (obligatorias):
- NO uses ni menciones edad, género, nacionalidad, estado civil, religión, foto ni
  ningún dato personal no relacionado con el puesto.
- NO inventes experiencia, títulos ni habilidades que no figuren en el CV.
- Si falta información relevante, indicá "no especificado" en lugar de suponer.
- La puntuación (score) va de 0 a 100 según el ajuste a los requisitos.
- La decisión final siempre es humana: sos una herramienta de apoyo, no rechazás ni contratás.

ESTRUCTURA: devolvé únicamente un JSON con el formato solicitado.
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
  };
}