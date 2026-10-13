const config = require("../../config");
const gemini = require("./gemini");
const { createOpenAiCompat } = require("./openaiCompat");

// Registro de motores disponibles. Un proveedor solo existe si tiene credencial
// configurada; si no, la cadena lo saltea (como si no estuviera).
const registry = { gemini };

if (config.providers.groq.apiKey) {
  registry.groq = createOpenAiCompat({ id: "groq", baseUrl: config.providers.groq.baseUrl, apiKey: config.providers.groq.apiKey });
}

if (config.providers.openrouter.apiKey) {
  registry.openrouter = createOpenAiCompat({
    id: "openrouter",
    baseUrl: config.providers.openrouter.baseUrl,
    apiKey: config.providers.openrouter.apiKey,
  });
}

function getProvider(id) {
  return registry[id] || null;
}

module.exports = { getProvider };
