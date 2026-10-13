require("dotenv").config();

// Lee un número del entorno; devuelve `fallback` si no es válido o está vacío.
function num(value, fallback) {
  const n = Number(value);
  return value === undefined || value === "" || Number.isNaN(n) ? fallback : n;
}

// Lee un texto del entorno; devuelve `fallback` si está vacío.
function str(value, fallback) {
  return value === undefined || value === "" ? fallback : value;
}

const geminiModel = str(process.env.GEMINI_MODEL, "gemini-3.8-flash");

module.exports = {
  port: num(process.env.PORT, 3000),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel,
  // Modelos por tarea: las tareas cortas pueden usar uno más liviano/rápido. El
  // scoring mantiene el modelo principal por calidad.
  geminiSuggestModel: str(process.env.GEMINI_SUGGEST_MODEL, geminiModel),
  geminiChatModel: str(process.env.GEMINI_CHAT_MODEL, geminiModel),
  geminiEmbedModel: str(process.env.GEMINI_EMBED_MODEL, "gemini-embedding-001"),
  embedDimensions: num(process.env.EMBED_DIMENSIONS, 768),

  // Nivel de razonamiento ("thinking") de los modelos Gemini 3: "low" responde
  // más rápido y "high" razona más profundo. Vacío/"" = no se envía el ajuste y
  // queda el default del modelo. En tareas cortas, pensar de más es la principal
  // causa de demora.
  thinkingLevel: {
    suggest: str(process.env.GEMINI_THINKING_LEVEL_SUGGEST, "low"),
    chat: str(process.env.GEMINI_THINKING_LEVEL_CHAT, "low"),
    scoring: str(process.env.GEMINI_THINKING_LEVEL_SCORING, "high"),
  },

  // Alternativa para modelos que usan presupuesto de tokens en vez de nivel
  // (p. ej. Gemini 2.5): 0 desactiva, -1 automático, vacío = no se envía.
  thinkingBudget: {
    suggest: num(process.env.GEMINI_THINKING_BUDGET_SUGGEST, undefined),
    chat: num(process.env.GEMINI_THINKING_BUDGET_CHAT, undefined),
    scoring: num(process.env.GEMINI_THINKING_BUDGET_SCORING, undefined),
  },

  // Tope de tokens de salida (0 = sin tope explícito).
  maxOutputTokens: num(process.env.GEMINI_MAX_OUTPUT_TOKENS, 0),

  // Timeout por intento contra la IA, en ms (evita esperas infinitas).
  aiTimeoutMs: num(process.env.AI_REQUEST_TIMEOUT_MS, 120000),

  // Reintentos ante errores transitorios (503/429): menos en las interactivas.
  aiRetries: {
    interactive: num(process.env.GEMINI_RETRIES_INTERACTIVE, 2),
    batch: num(process.env.GEMINI_RETRIES_BATCH, 3),
  },
};
