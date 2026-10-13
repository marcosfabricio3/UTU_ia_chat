const fs = require("fs");
const config = require("../../config");
const { statusOf } = require("../aiErrors");

// Motor Gemini (SDK @google/genai). Único motor que acepta PDF nativo, por lo
// que es el que se usa para CVs escaneados o con layout complejo.

let client;

async function getClient() {
  if (!client) {
    if (!config.geminiApiKey) throw new Error("Falta configurar GEMINI_API_KEY en .env");
    const { GoogleGenAI } = await import("@google/genai");
    // Timeout por intento en TODAS las llamadas: un request colgado no puede
    // dejar esperando al usuario para siempre.
    client = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      httpOptions: { timeout: config.aiRequestTimeoutMs },
    });
  }
  return client;
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

function hasThinking(req) {
  return !!(String(req.thinkingLevel || "").trim() || typeof req.thinkingBudget === "number");
}

function buildConfig(req, useThinking) {
  const configOut = {};
  if (req.systemInstruction) configOut.systemInstruction = req.systemInstruction;
  if (req.responseSchema) {
    configOut.responseMimeType = "application/json";
    configOut.responseSchema = req.responseSchema;
  }
  if (useThinking) {
    const thinking = buildThinkingConfig(req.thinkingLevel, req.thinkingBudget);
    if (thinking) configOut.thinkingConfig = thinking;
  }
  if (req.maxOutputTokens) configOut.maxOutputTokens = req.maxOutputTokens;
  return configOut;
}

function buildContents(req) {
  const parts = [{ text: req.message }];
  for (const file of req.files || []) {
    parts.push({
      inlineData: { mimeType: file.mimeType, data: fs.readFileSync(file.path).toString("base64") },
    });
  }
  return parts;
}

// El modelo rechazó el ajuste de "thinking" (400). Conviene reintentar sin él.
function isThinkingUnsupported(error) {
  const status = statusOf(error);
  if (status !== 0 && status !== 400) return false;
  const m = String((error && error.message) || "");
  return /thinking/i.test(m) || status === 400;
}

function usageOf(response) {
  const u = (response && response.usageMetadata) || {};
  return {
    promptTokens: u.promptTokenCount,
    outputTokens: u.candidatesTokenCount,
    thoughtsTokens: u.thoughtsTokenCount,
  };
}

/* ---------------- Llamadas ---------------- */

async function generate(model, req) {
  const ai = await getClient();
  let useThinking = true;
  for (;;) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: buildContents(req),
        config: buildConfig(req, useThinking),
      });
      return { text: response.text, usage: usageOf(response) };
    } catch (error) {
      if (useThinking && hasThinking(req) && isThinkingUnsupported(error)) {
        useThinking = false;
        continue;
      }
      throw error;
    }
  }
}

async function* stream(model, req) {
  const ai = await getClient();
  let useThinking = true;
  for (;;) {
    let emitted = false;
    try {
      const s = await ai.models.generateContentStream({
        model,
        contents: buildContents(req),
        config: buildConfig(req, useThinking),
      });
      let last = null;
      for await (const chunk of s) {
        last = chunk;
        const piece = chunk.text;
        if (piece) {
          emitted = true;
          yield { text: piece };
        }
      }
      return usageOf(last);
    } catch (error) {
      if (!emitted && useThinking && hasThinking(req) && isThinkingUnsupported(error)) {
        useThinking = false;
        continue;
      }
      throw error;
    }
  }
}

module.exports = {
  id: "gemini",
  accepts: ["text", "pdf"],
  supportsThinking: true,
  getClient,
  generate,
  stream,
};
