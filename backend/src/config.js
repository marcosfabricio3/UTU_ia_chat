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

// "a, b ,, c" → ["a","b","c"] (sin vacíos ni repetidos).
function list(value) {
  const out = [];
  for (const parte of String(value || "").split(",")) {
    const nombre = parte.trim();
    if (nombre && !out.includes(nombre)) out.push(nombre);
  }
  return out;
}

// Normaliza una entrada de cadena a `{ provider, model }`. Acepta:
//   - "modelo"                 → proveedor por defecto: Gemini.
//   - "proveedor:modelo"       → p. ej. `groq:openai/gpt-oss-120b`. Se separa por
//                                el PRIMER ":" para permitir modelos con ":"
//                                (p. ej. OpenRouter `:free`).
//   - `{ provider, model }`    → ya normalizada (se devuelve tal cual).
function parseEntry(entry) {
  if (entry && typeof entry === "object") {
    return { provider: entry.provider || "gemini", model: entry.model };
  }
  const raw = String(entry || "").trim();
  const idx = raw.indexOf(":");
  if (idx > 0) return { provider: raw.slice(0, idx), model: raw.slice(idx + 1) };
  return { provider: "gemini", model: raw };
}

// Cadena de modelos de una tarea: si hay lista explícita se respeta tal cual; si
// no, se arma con el modelo de la tarea seguido de los respaldos comunes.
function chain(envLista, head, fallbacks) {
  const explicita = list(envLista);
  const nombres = [];
  if (explicita.length) nombres.push(...explicita);
  else for (const nombre of [head, ...fallbacks]) if (nombre && !nombres.includes(nombre)) nombres.push(nombre);
  return nombres.map(parseEntry);
}

const geminiModel = str(process.env.GEMINI_MODEL, "gemini-3.8-flash");

// Respaldos por defecto (familias distintas: dos alias de la misma familia
// comparten cuota y no suman cupo). El orden es de mejor a más liviano.
// `gemini-3.5-flash`/`-lite` comparten el bucket diario de "3.6-flash"; el
// `3.1-flash-lite` va último porque tiene su **propio bucket** (útil cuando la
// familia 3.5/3.6 agotó su cuota diaria).
const FALLBACKS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

module.exports = {
  parseEntry,
  port: num(process.env.PORT, 3000),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel,
  geminiEmbedModel: str(process.env.GEMINI_EMBED_MODEL, "gemini-embedding-001"),
  embedDimensions: num(process.env.EMBED_DIMENSIONS, 768),

  // Cadenas de modelos por tarea (el orden es la preferencia). Cada entrada es
  // "modelo" (Gemini) o "proveedor:modelo". Ante saturación (503), cuota diaria
  // agotada (429) o modelo retirado (404), se pasa al siguiente sin cortar la
  // consulta. Además, si el pedido lleva un PDF adjunto, se omiten los motores
  // que no leen PDF (p. ej. Groq): eso lo resuelve el orquestador.
  modelChains: {
    // Sugerencias y chat: interactivos y de mucho volumen → conviene empezar por
    // Groq (cuota diaria mucho más amplia) y dejar Gemini como respaldo.
    suggest: chain(
      process.env.AI_SUGGEST_MODELS || process.env.GEMINI_SUGGEST_MODELS,
      str(process.env.AI_SUGGEST_MODEL || process.env.GEMINI_SUGGEST_MODEL, geminiModel),
      FALLBACKS
    ),
    chat: chain(
      process.env.AI_CHAT_MODELS || process.env.GEMINI_CHAT_MODELS,
      str(process.env.AI_CHAT_MODEL || process.env.GEMINI_CHAT_MODEL, geminiModel),
      FALLBACKS
    ),
    // El scoring prioriza calidad y puede leer PDF: Gemini primero.
    scoring: chain(
      process.env.AI_SCORING_MODELS || process.env.GEMINI_SCORING_MODELS,
      geminiModel,
      FALLBACKS
    ),
  },

  // Motores disponibles. `baseUrl` es la API compatible con OpenAI.
  providers: {
    gemini: { apiKey: process.env.GEMINI_API_KEY },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: str(process.env.GROQ_BASE_URL, "https://api.groq.com/openai/v1"),
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: str(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1"),
    },
  },

  // Cómo procesar cada CV: "auto" extrae el texto y, si no hay capa de texto
  // (escaneado) o el resultado es pobre, manda el PDF nativo; "pdf" siempre
  // manda el PDF (comportamiento previo, sin extracción).
  pdfMode: str(process.env.AI_PDF_MODE, "auto"),
  // Por debajo de esta cantidad de caracteres se considera que el PDF no tiene
  // capa de texto útil (escaneado o vacío) y se manda el PDF nativo.
  pdfMinTextChars: num(process.env.PDF_MIN_TEXT_CHARS, 150),

  // Nivel de razonamiento ("thinking") de los modelos Gemini 3: "low" responde
  // más rápido y "high" razona más profundo. Vacío/"" = no se envía el ajuste y
  // queda el default del modelo. En tareas cortas, pensar de más es la principal
  // causa de demora. Se aplica a todos los modelos de la cadena.
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
  aiRequestTimeoutMs: num(process.env.AI_REQUEST_TIMEOUT_MS, 45000),
  // Tope total por consulta (o por CV en el análisis), sumando todos los
  // intentos de la cadena. Evita que la suma de reintentos sea eterna.
  aiTotalTimeoutMs: num(process.env.AI_TOTAL_TIMEOUT_MS, 120000),
  // Cuántas veces se recorre la cadena completa antes de rendirse.
  aiFailoverRounds: num(process.env.AI_FAILOVER_ROUNDS, 2),
  // "Circuit breaker" suave: un modelo que falla se enfría este tiempo y pasa al
  // final de la cadena (no se descarta: si todos están fríos, igual se intenta).
  aiModelCooldownMs: num(process.env.AI_MODEL_COOLDOWN_MS, 45000),
  // Reintentos rápidos del MISMO modelo ante límite por minuto (429 por minuto).
  aiSameModelRetries: num(process.env.AI_SAME_MODEL_RETRIES, 1),
  // A partir de este retryDelay (segundos) se considera cuota agotada y se salta
  // de modelo, en vez de esperar.
  aiQuotaSwitchSeconds: num(process.env.AI_QUOTA_SWITCH_SECONDS, 60),

  // Reintentos para embeddings (no hay respaldo de modelo: cambiar de embedding
  // rompería la comparación de vectores ya guardados).
  aiRetries: {
    batch: num(process.env.GEMINI_RETRIES_BATCH, 3),
  },
};
