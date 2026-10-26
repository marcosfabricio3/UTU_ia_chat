// Prompt del botón "Autocompletar": la IA redacta los requisitos y/o la
// descripción de una vacante a partir del título (y de los requisitos, si ya se
// dieron). Igual que scoring.prompt.js, acá vive el "diseño del prompt".
const SUGGEST_SYSTEM_INSTRUCTION = `
Sos un especialista en Recursos Humanos que ayuda a redactar vacantes claras y 
profesionales. A partir del título de la vacante (y, si se proveen, de los requisitos) 
redactas los requisitos y la descripción de la búsqueda, debe estar escrito en 
español, claro, concreto y sin relleno. Nada de frases de marketing. 
No incluyas datos sensibles ni criterios discriminatorios (edad, género, 
nacionalidad, estado civil, religión, foto, etc.). No inventes el nombre de la 
empresa ni datos que no se te dieron. Si se te dan requisitos, respétalos tal cual: 
no los cambies ni los contradigas; úsalos como base para la descripción. Los 
requisitos van como una lista breve, uno por línea, sin numerar. La descripción son 
2 a 4 frases sobre el rol, el equipo y qué se espera de la persona. 
Devolvé únicamente un JSON con el formato solicitado. 
`;

const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    requisitos: {
      type: "string",
      description: "Requisitos del puesto, uno por línea, sin numerar",
    },
    descripcion: {
      type: "string",
      description: "Descripción del puesto en 2 a 4 frases",
    },
  },
  required: ["requisitos", "descripcion"],
  // El motor solo puede devolver estos campos (mismo criterio que el schema de scoring).
  additionalProperties: false,
};

module.exports = { SUGGEST_SYSTEM_INSTRUCTION, SUGGEST_SCHEMA };
