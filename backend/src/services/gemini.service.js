const fs = require("fs");
const {
  geminiApiKey,
  geminiModel,
  geminiEmbedModel,
  embedDimensions,
  aiTimeoutMs,
  aiRetries,
} = require("../config");

let client;

async function getClient() {
  if (!client) {
    if (!geminiApiKey) {
      throw new Error("Falta configurar GEMINI_API_KEY en .env");
    }
    const { GoogleGenAI } = await import("@google/genai");
    // Timeout por defecto en TODAS las llamadas: un request colgado no puede
    // dejar esperando al usuario para siempre (se puede acortar por tarea).
    client = new GoogleGenAI({ apiKey: geminiApiKey, httpOptions: { timeout: aiTimeoutMs } });
  }
  return client;
}

/* ---------------- Errores ---------------- */

// Código HTTP del error, venga en .status, en .code o dentro del JSON de .message.
function statusOf(error) {
  if (!error) return 0;
  let status = Number(error.status || error.statusCode || error.code) || 0;
  if (!status && typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      status = Number((parsed && parsed.error && parsed.error.code) || 0);
    } catch (e) {
      /* message no es JSON */
    }
  }
  return status;
}

// Errores transitorios de la IA que vale la pena reintentar: servicio saturado
// (503), límite por minuto (429), error interno (500). NO se reintentan los 4xx
// (401/403/400): reintentar no los arregla.
function isRetriableAiError(error) {
  const status = statusOf(error);
  if (status === 429 || status === 500 || status === 503 || status === 504) return true;
  const m = String((error && error.message) || "");
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|saturado/i.test(m);
}

// ¿El modelo rechazó el ajuste de "thinking"? Los modelos Gemini 3 usan
// `thinkingLevel` y los 2.5 `thinkingBudget`; si el que mandamos no corresponde,
// la API responde 400 INVALID_ARGUMENT. Ese 400 no menciona "thinking", así que
// no podemos distinguirlo por el texto: ante un 400 con ajuste de thinking
// presente, vale la pena reintentar sin él (es lo único no estándar que enviamos).
function isThinkingUnsupported(error) {
  const status = statusOf(error);
  if (status !== 0 && status !== 400) return false;
  const m = String((error && error.message) || "");
  return /thinking/i.test(m) || status === 400;
}

// Reintenta con espera creciente (1s, 2s, …). `attempts` se ajusta por tarea:
// pocas en las interactivas (el usuario está esperando), más en el batch.
async function withRetry(fn, { attempts = 3, baseDelayMs = 1000, label = "ai" } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (error) {
      lastError = error;
      if (!isRetriableAiError(error) || i === attempts - 1) throw error;
      const wait = baseDelayMs * (i + 1);
      console.warn(
        `[ai:${label}] intento ${i + 1}/${attempts} falló (status ${statusOf(error) || "?"}); ` +
          `reintento en ${wait}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

/* ---------------- Logs de latencia ---------------- */
// Permiten ver DÓNDE se va el tiempo: ms totales y tokens de "pensamiento"
// (thoughtsTokenCount) vs. tokens de salida. No cuestan cuota.
function logOk(label, response, ms) {
  const u = (response && response.usageMetadata) || {};
  const thoughts = u.thoughtsTokenCount != null ? ` pensados=${u.thoughtsTokenCount}` : "";
  const entrada = u.promptTokenCount != null ? u.promptTokenCount : "?";
  const salida = u.candidatesTokenCount != null ? u.candidatesTokenCount : "?";
  console.log(`[ai:${label}] ok en ${ms}ms${thoughts} entrada=${entrada} salida=${salida}`);
}

function logFail(label, error, ms) {
  const msg = (error && error.message) || error;
  console.error(`[ai:${label}] error en ${ms}ms (status ${statusOf(error) || "?"}): ${msg}`);
}

/* ---------------- Armado de la petición ---------------- */

function buildThinkingConfig(thinkingLevel, thinkingBudget) {
  // Gemini 3: nivel ("LOW"/"HIGH"). Gemini 2.5: presupuesto de tokens.
  // Solo se envía lo que venga definido: hay modelos que rechazan este ajuste.
  const cfg = {};
  if (typeof thinkingLevel === "string" && thinkingLevel.trim()) {
    cfg.thinkingLevel = thinkingLevel.trim().toUpperCase();
  }
  if (typeof thinkingBudget === "number") cfg.thinkingBudget = thinkingBudget;
  return Object.keys(cfg).length ? cfg : null;
}

function buildConfig({
  systemInstruction,
  responseSchema,
  thinkingLevel,
  thinkingBudget,
  maxOutputTokens,
  timeoutMs,
}) {
  const config = {};
  if (systemInstruction) config.systemInstruction = systemInstruction;
  if (responseSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = responseSchema;
  }
  const thinking = buildThinkingConfig(thinkingLevel, thinkingBudget);
  if (thinking) config.thinkingConfig = thinking;
  if (typeof maxOutputTokens === "number" && maxOutputTokens > 0) {
    config.maxOutputTokens = maxOutputTokens;
  }
  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    config.httpOptions = { timeout: timeoutMs };
  }
  return config;
}

function buildContents(message, files) {
  if (!files || !files.length) return message;
  const contents = [{ text: message }];
  for (const f of files) {
    const data = fs.readFileSync(f.path).toString("base64");
    contents.push({ inlineData: { data, mimeType: f.mimeType } });
  }
  return contents;
}

/* ---------------- API pública ---------------- */

// Genera texto. Acepta systemInstruction, responseSchema (JSON), files (PDF inline)
// y los controles de latencia: model, thinkingLevel / thinkingBudget, timeoutMs.
async function generateResponse(
  message,
  {
    systemInstruction,
    responseSchema,
    files,
    model = geminiModel,
    thinkingLevel,
    thinkingBudget,
    maxOutputTokens,
    timeoutMs,
    attempts = aiRetries.batch,
    label = "generate",
  } = {}
) {
  const ai = await getClient();
  const config = buildConfig({
    systemInstruction,
    responseSchema,
    thinkingLevel,
    thinkingBudget,
    maxOutputTokens,
    timeoutMs,
  });
  const contents = buildContents(message, files);
  const retryOpts = { attempts, baseDelayMs: 1000, label };
  const started = Date.now();

  try {
    let response;
    try {
      response = await withRetry(() => ai.models.generateContent({ model, contents, config }), retryOpts);
    } catch (error) {
      // El modelo no soporta thinking: se reintenta una vez sin el tope.
      if (config.thinkingConfig && isThinkingUnsupported(error)) {
        console.warn(`[ai:${label}] el modelo rechazó thinkingConfig; reintento sin él.`);
        delete config.thinkingConfig;
        response = await withRetry(() => ai.models.generateContent({ model, contents, config }), retryOpts);
      } else {
        throw error;
      }
    }
    logOk(label, response, Date.now() - started);
    return response.text;
  } catch (error) {
    logFail(label, error, Date.now() - started);
    throw error;
  }
}

// Igual que generateResponse pero en streaming: cede los fragmentos de texto a
// medida que llegan (para mostrar la respuesta "escribiéndose").
async function* generateResponseStream(
  message,
  {
    systemInstruction,
    responseSchema,
    files,
    model = geminiModel,
    thinkingLevel,
    thinkingBudget,
    maxOutputTokens,
    timeoutMs,
    attempts = aiRetries.interactive,
    label = "stream",
  } = {}
) {
  const ai = await getClient();
  const config = buildConfig({
    systemInstruction,
    responseSchema,
    thinkingLevel,
    thinkingBudget,
    maxOutputTokens,
    timeoutMs,
  });
  const contents = buildContents(message, files);
  const started = Date.now();

  let stream;
  try {
    try {
      stream = await withRetry(
        () => ai.models.generateContentStream({ model, contents, config }),
        { attempts, baseDelayMs: 1000, label }
      );
    } catch (error) {
      // El modelo rechazó el ajuste de thinking: se reintenta sin él.
      if (config.thinkingConfig && isThinkingUnsupported(error)) {
        console.warn(`[ai:${label}] el modelo rechazó thinkingConfig; reintento sin él.`);
        delete config.thinkingConfig;
        stream = await withRetry(
          () => ai.models.generateContentStream({ model, contents, config }),
          { attempts, baseDelayMs: 1000, label }
        );
      } else {
        throw error;
      }
    }
  } catch (error) {
    logFail(label, error, Date.now() - started);
    throw error;
  }

  let last;
  try {
    for await (const chunk of stream) {
      last = chunk;
      const piece = chunk.text;
      if (piece) yield piece;
    }
    logOk(label, last, Date.now() - started);
  } catch (error) {
    logFail(label, error, Date.now() - started);
    throw error;
  }
}

async function embedTexts(texts) {
  const ai = await getClient();
  const started = Date.now();

  try {
    const response = await withRetry(
      () =>
        ai.models.embedContent({
          model: geminiEmbedModel,
          contents: texts,
          config: { outputDimensionality: embedDimensions },
        }),
      { attempts: aiRetries.batch, baseDelayMs: 1000, label: "embed" }
    );
    console.log(`[ai:embed] ok en ${Date.now() - started}ms (${texts.length} texto/s)`);
    return response.embeddings.map((e) => e.values);
  } catch (error) {
    logFail("embed", error, Date.now() - started);
    throw error;
  }
}

async function listModels() {
  const ai = await getClient();
  const models = await ai.models.list();
  for await (const model of models) {
    console.log({ nombre: model.name });
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
  let status = statusOf(error);
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

module.exports = {
  generateResponse,
  generateResponseStream,
  embedTexts,
  listModels,
  friendlyAiError,
};
