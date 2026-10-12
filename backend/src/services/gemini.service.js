const fs = require("fs");
const {
  geminiApiKey,
  geminiModel,
  geminiEmbedModel,
  embedDimensions,
} = require("../config");

let client;

async function getClient() {
  if (!client) {
    if (!geminiApiKey) {
      throw new Error("Falta configurar GEMINI_API_KEY en .env");
    }
    const { GoogleGenAI } = await import("@google/genai");
    client = new GoogleGenAI({ apiKey: geminiApiKey });
  }
  return client;
}

// Errores transitorios de la IA que vale la pena reintentar: servicio saturado
// (503), límite por minuto (429), error interno (500) o timeout (504). NO se
// reintentan 401/403 (credencial) ni errores de formato: no cambiarían.
function isRetriableAiError(error) {
  const status = Number(error && (error.status || error.statusCode || error.code)) || 0;
  if (status === 429 || status === 500 || status === 503 || status === 504) return true;
  const msg = String((error && error.message) || "");
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|overloaded|saturado/i.test(msg);
}

// Reintenta una llamada a la IA ante errores transitorios, con espera creciente
// (1s, 2s, …). Si el último intento falla, se propaga el error original.
async function withRetry(fn, { attempts = 3, baseDelayMs = 1000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetriableAiError(error) || i === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
    }
  }
  throw lastError;
}

// Genera texto. Acepta systemInstruction, responseSchema (JSON) y files (PDF inline).
async function generateResponse(message, { systemInstruction, responseSchema, files } = {}) {
  const ai = await getClient();

  const config = {};
  if (systemInstruction) config.systemInstruction = systemInstruction;
  if (responseSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = responseSchema;
  }

  let contents = message;
  if (files && files.length) {
    contents = [{ text: message }];
    for (const f of files) {
      const data = fs.readFileSync(f.path).toString("base64");
      contents.push({ inlineData: { data, mimeType: f.mimeType } });
    }
  }

  const response = await withRetry(() =>
    ai.models.generateContent({ model: geminiModel, contents, config })
  );

  return response.text;
}

async function embedTexts(texts) {
  const ai = await getClient();

  const response = await withRetry(() =>
    ai.models.embedContent({
      model: geminiEmbedModel,
      contents: texts,
      config: { outputDimensionality: embedDimensions },
    })
  );

  return response.embeddings.map((e) => e.values);
}

async function listModels() {
  const ai = await getClient();
  const models = await ai.models.list();
  for await (const model of models) {
    console.log({ nombre: model.name, metodos: model.supportedGenerationMethods });
  }
}

// Traduce los errores de la API de Gemini a mensajes accionables en español.
// Devuelve null si no reconoce el error (el llamador usa un mensaje genérico).
function friendlyAiError(error) {
  if (!error) return null;

  // Estados en texto del SDK (por si faltara el código HTTP numérico).
  const TEXT_STATUS = {
    RESOURCE_EXHAUSTED: 429,
    UNAVAILABLE: 503,
    DEADLINE_EXCEEDED: 504,
    UNAUTHENTICATED: 401,
    PERMISSION_DENIED: 403,
  };

  // El SDK expone el código HTTP en .status; si faltara, lo buscamos en el
  // JSON que a veces trae .message ({"error":{"code":503,...}}).
  let status = Number(error.status || error.statusCode || error.code) || 0;
  if (!status && typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      const inner = (parsed && parsed.error) || {};
      status = Number(inner.code) || TEXT_STATUS[inner.status] || 0;
    } catch (e) {
      /* message no es JSON: seguimos con el mensaje genérico */
    }
  }

  if (status === 429) return "Se alcanzó el límite de uso de la IA. Probá de nuevo más tarde.";
  if (status === 503) return "El servicio de IA está saturado. Probá de nuevo en unos segundos.";
  if (status === 504) return "La IA tardó demasiado en responder. Probá de nuevo.";
  if (status === 401 || status === 403) {
    return "La credencial de la IA no es válida o no tiene permisos.";
  }
  return null;
}

module.exports = { generateResponse, embedTexts, listModels, friendlyAiError };