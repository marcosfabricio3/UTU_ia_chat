const fs = require("fs");
const {
  geminiApiKey,
  geminiModel,
  geminiEmbedModel,
  embedDimensions,
  aiRequestTimeoutMs,
  aiTotalTimeoutMs,
  aiFailoverRounds,
  aiModelCooldownMs,
  aiSameModelRetries,
  aiQuotaSwitchSeconds,
  aiRetries,
} = require("../config");

let client;

async function getClient() {
  if (!client) {
    if (!geminiApiKey) {
      throw new Error("Falta configurar GEMINI_API_KEY en .env");
    }
    const { GoogleGenAI } = await import("@google/genai");
    // Timeout por intento en TODAS las llamadas: un request colgado no puede
    // dejar esperando al usuario para siempre (se puede acortar por tarea).
    client = new GoogleGenAI({ apiKey: geminiApiKey, httpOptions: { timeout: aiRequestTimeoutMs } });
  }
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// Segundos que la API sugiere esperar: campo retryDelay de RetryInfo ("3600s")
// o el texto "Please retry in 12.3s".
function retryDelaySeconds(error) {
  const m = String((error && error.message) || "");
  let found = /"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i.exec(m);
  if (found) return Number(found[1]);
  found = /retry in (\d+(?:\.\d+)?)s/i.exec(m);
  if (found) return Number(found[1]);
  return null;
}

// ¿El 429 es por cuota diaria agotada (no se destraba esperando)? Se detecta por
// el texto ("per day") o porque el retryDelay sugerido es largo.
function isDailyQuota(error) {
  const m = String((error && error.message) || "");
  if (/per day|perday|daily|por d[ií]a/i.test(m)) return true;
  const segundos = retryDelaySeconds(error);
  return segundos != null && segundos >= aiQuotaSwitchSeconds;
}

// Qué hacer ante un error de la IA (define el failover):
//   "retry-same": límite por minuto; conviene esperar y reintentar el mismo modelo.
//   "next-model": saturado / cuota diaria / modelo retirado / corte de red →
//                 pasar al siguiente de la cadena (la consulta no se corta).
//   "fatal": no se arregla reintentando (credencial, pedido inválido).
function classifyAiError(error) {
  const status = statusOf(error);
  if (status === 429) return isDailyQuota(error) ? "next-model" : "retry-same";
  // 400 acá ya pasó el chequeo de "thinking": es un pedido realmente inválido.
  if (status === 400 || status === 401 || status === 403 || status === 422) return "fatal";
  // 404 (modelo retirado), 5xx, cortes de red y errores sin código: probar otro
  // modelo. Es el caso por defecto: ante la duda, seguir es mejor que cortar.
  return "next-model";
}

// Errores transitorios que vale la pena reintentar (se usa en los embeddings, que
// no tienen respaldo de modelo). NO se reintentan los 4xx: reintentar no los arregla.
function isRetriableAiError(error) {
  const status = statusOf(error);
  if (status === 429 || status === 500 || status === 503 || status === 504) return true;
  const m = String((error && error.message) || "");
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|saturado/i.test(m);
}

// El modelo rechazó el ajuste de "thinking" (400). Gemini 3 usa thinkingLevel y
// Gemini 2.5 thinkingBudget; si nos equivocamos, conviene reintentar sin el ajuste.
function isThinkingUnsupported(error) {
  const status = statusOf(error);
  if (status !== 0 && status !== 400) return false;
  const m = String((error && error.message) || "");
  return /thinking/i.test(m) || status === 400;
}

// Reintenta con espera creciente (1s, 2s, …). `attempts` se ajusta por tarea.
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
      await sleep(wait);
    }
  }
  throw lastError;
}

/* ---------------- Circuit breaker (enfriamiento suave) ---------------- */

// modelo → timestamp (ms) hasta el que se lo considera "frío".
const cooldownUntil = new Map();

function isCooling(model) {
  return (cooldownUntil.get(model) || 0) > Date.now();
}

// Enfría un modelo que falló: pasa al final de la cadena durante un rato. NO se
// descarta: si todos están fríos, igual se intentan (evita un falso "sin modelos").
function coolModel(model, label) {
  cooldownUntil.set(model, Date.now() + aiModelCooldownMs);
  const segundos = Math.round(aiModelCooldownMs / 1000);
  console.warn(`[ai:${label}] ${model} pasa a enfriamiento por ${segundos}s`);
}

// Reordena la cadena: primero los modelos "calientes", al final los enfriados.
function orderModels(models) {
  const calientes = [];
  const frios = [];
  for (const model of models) (isCooling(model) ? frios : calientes).push(model);
  return calientes.concat(frios);
}

// Lista de intentos: ronda 1 recorre la cadena ordenada, ronda 2 la reintenta, etc.
// Se materializa para saber si quedan intentos (decide si avisar el "restart").
function attemptPlan(models, rounds) {
  const orden = orderModels(models);
  const plan = [];
  for (let ronda = 1; ronda <= rounds; ronda++) {
    for (const model of orden) plan.push(model);
  }
  return plan;
}

/* ---------------- Logs de latencia ---------------- */
// Permiten ver DÓNDE se va el tiempo: ms totales y tokens de "pensamiento"
// (thoughtsTokenCount) vs. tokens de salida. No cuestan cuota.
function logOk(label, response, ms, model) {
  const u = (response && response.usageMetadata) || {};
  const thoughts = u.thoughtsTokenCount != null ? ` pensados=${u.thoughtsTokenCount}` : "";
  const entrada = u.promptTokenCount != null ? u.promptTokenCount : "?";
  const salida = u.candidatesTokenCount != null ? u.candidatesTokenCount : "?";
  const quien = model ? ` (${model})` : "";
  console.log(`[ai:${label}] ok en ${ms}ms${quien}${thoughts} entrada=${entrada} salida=${salida}`);
}

function logFail(label, error, ms, model) {
  const msg = (error && error.message) || error;
  const quien = model ? ` (${model})` : "";
  console.error(`[ai:${label}] error en ${ms}ms${quien} (status ${statusOf(error) || "?"}): ${msg}`);
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

// Cadena de modelos a usar: la explícita (`models`) o el modelo suelto `model`.
function chainOf(models, model) {
  return models && models.length ? models : [model || geminiModel];
}

/* ---------------- API pública ---------------- */

// Genera texto. Acepta systemInstruction, responseSchema (JSON), files (PDF inline)
// y los controles de latencia: models, thinkingLevel / thinkingBudget, timeoutMs.
//
// Failover: si un modelo está saturado (503), con la cuota diaria agotada (429) o
// fue retirado (404), se pasa al siguiente de `models` sin cortar la consulta.
// Un 401/403/400 (salvo el de "thinking") es fatal y no se reintenta.
async function generateResponse(message, opts = {}) {
  const {
    systemInstruction,
    responseSchema,
    files,
    model,
    models,
    thinkingLevel,
    thinkingBudget,
    maxOutputTokens,
    timeoutMs,
    label = "generate",
  } = opts;

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
  const plan = attemptPlan(chainOf(models, model), aiFailoverRounds);
  const started = Date.now();
  let lastError = null;

  for (let i = 0; i < plan.length; i++) {
    const name = plan[i];
    if (Date.now() - started >= aiTotalTimeoutMs) break;

    let sameRetries = 0;
    for (;;) {
      try {
        const response = await ai.models.generateContent({ model: name, contents, config });
        logOk(label, response, Date.now() - started, name);
        return response.text;
      } catch (error) {
        lastError = error;

        // El modelo no soporta el ajuste de thinking: se reintenta sin él.
        if (config.thinkingConfig && isThinkingUnsupported(error)) {
          console.warn(`[ai:${label}] ${name} rechazó thinkingConfig; reintento sin él.`);
          delete config.thinkingConfig;
          continue;
        }

        const action = classifyAiError(error);
        if (action === "fatal") {
          logFail(label, error, Date.now() - started, name);
          throw error;
        }
        if (action === "retry-same" && sameRetries < aiSameModelRetries) {
          sameRetries++;
          const wait = 800 * sameRetries;
          console.warn(`[ai:${label}] ${name} limitado por minuto; reintento en ${wait}ms`);
          await sleep(wait);
          continue;
        }

        coolModel(name, label);
        console.warn(
          `[ai:${label}] ${name} falló (status ${statusOf(error) || "?"}); paso al siguiente modelo.`
        );
        break; // siguiente modelo de la cadena
      }
    }
  }

  logFail(label, lastError, Date.now() - started);
  throw lastError || new Error("No se pudo obtener respuesta de la IA.");
}

// Igual que generateResponse pero en streaming. Cede eventos:
//   { type: "delta",  text }                 → fragmento para mostrar
//   { type: "notice", message }              → aviso suave (cambio de modelo sin texto aún)
//   { type: "restart", message, model }      → descartar lo mostrado y reiniciar
//
// Si un modelo falla DESPUÉS de haber emitido texto, el texto parcial ya no sirve:
// se avisa con "restart" (el frontend vacía la burbuja) y se sigue con el próximo
// modelo. Si falla ANTES de emitir, el cambio es silencioso (solo "notice").
async function* generateResponseStream(message, opts = {}) {
  const {
    systemInstruction,
    responseSchema,
    files,
    model,
    models,
    thinkingLevel,
    thinkingBudget,
    maxOutputTokens,
    timeoutMs,
    label = "stream",
  } = opts;

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
  const plan = attemptPlan(chainOf(models, model), aiFailoverRounds);
  const started = Date.now();
  let lastError = null;
  let alreadyEmitted = false; // ya se mostró algo del modelo actual/previo

  for (let i = 0; i < plan.length; i++) {
    const name = plan[i];
    const hasMore = i < plan.length - 1;
    if (Date.now() - started >= aiTotalTimeoutMs) break;

    let emittedHere = false;
    let last = null;
    try {
      const stream = await ai.models.generateContentStream({ model: name, contents, config });
      for await (const chunk of stream) {
        last = chunk;
        const piece = chunk.text;
        if (piece) {
          emittedHere = true;
          alreadyEmitted = true;
          yield { type: "delta", text: piece };
        }
      }
      logOk(label, last, Date.now() - started, name);
      return;
    } catch (error) {
      lastError = error;

      // El modelo no soporta el ajuste de thinking: se reintenta el MISMO modelo.
      if (!emittedHere && config.thinkingConfig && isThinkingUnsupported(error)) {
        console.warn(`[ai:${label}] ${name} rechazó thinkingConfig; reintento sin él.`);
        delete config.thinkingConfig;
        plan.splice(i + 1, 0, name);
        continue;
      }

      const action = classifyAiError(error);
      if (action === "fatal") {
        logFail(label, error, Date.now() - started, name);
        throw error;
      }

      coolModel(name, label);
      console.warn(
        `[ai:${label}] ${name} falló (status ${statusOf(error) || "?"}); paso al siguiente modelo.`
      );

      if (emittedHere && hasMore) {
        yield {
          type: "restart",
          model: name,
          message: "Se cortó la respuesta a mitad; reinicio con otro modelo.",
        };
      } else if (!alreadyEmitted && hasMore) {
        yield { type: "notice", message: "El modelo estaba ocupado; probando otro…" };
      }
    }
  }

  logFail(label, lastError, Date.now() - started);
  throw lastError || new Error("No se pudo obtener respuesta de la IA.");
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
  const response = await ai.models.list();
  for await (const model of response) {
    console.log(model.name);
  }
}

// Traduce un error de la IA a un mensaje para el usuario.
function friendlyAiError(error) {
  if (!error) return null;

  // El SDK expone el código en .status; si faltara, lo buscamos en el JSON que
  // a veces viene dentro de .message ({"error":{"code":503,...}}).
  let status = statusOf(error);
  if (!status && typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      const inner = (parsed && parsed.error) || {};
      status = Number(inner.code) || 0;
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
