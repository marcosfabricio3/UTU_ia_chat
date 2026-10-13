const {
  geminiModel,
  geminiEmbedModel,
  embedDimensions,
  aiTotalTimeoutMs,
  aiFailoverRounds,
  aiModelCooldownMs,
  aiSameModelRetries,
  aiRetries,
} = require("../config");
const { getProvider } = require("./providers");
const geminiProvider = require("./providers/gemini");
const { statusOf, classifyAiError, isRetriableAiError, isConnectionError } = require("./aiErrors");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reintenta con espera creciente (1s, 2s, …). Se usa para los embeddings, que no
// tienen respaldo de modelo (van siempre contra Gemini).
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
        `[ai:${label}] intento ${i + 1}/${attempts} falló (status ${statusOf(error) || "?"}); reintento en ${wait}ms`
      );
      await sleep(wait);
    }
  }
  throw lastError;
}

/* ---------------- Cadena y capacidades ---------------- */

// Normaliza una entrada de cadena. Acepta `{ provider, model }` (nuevo) o el
// nombre suelto de un modelo (compatibilidad: proveedor Gemini).
function toEntry(x) {
  if (typeof x === "string") {
    const idx = x.indexOf(":");
    return idx > 0 ? { provider: x.slice(0, idx), model: x.slice(idx + 1) } : { provider: "gemini", model: x };
  }
  return { provider: x.provider || "gemini", model: x.model };
}

function chainOf(models, model) {
  const arr = models && models.length ? models : [model || geminiModel];
  return arr.map(toEntry);
}

function keyOf(entry) {
  return `${entry.provider}:${entry.model}`;
}

// Capacidad que exige el pedido: si lleva un PDF adjunto hace falta un motor con
// visión/PDF (Gemini); si no, alcanza con texto (Groq o Gemini).
function requiredCapability(opts) {
  return opts.files && opts.files.length ? "pdf" : "text";
}

/* ---------------- Circuit breaker (enfriamiento suave) ---------------- */

// clave de modelo ("proveedor:modelo") → timestamp (ms) hasta el que está frío.
const cooldownUntil = new Map();

function isCooling(key) {
  return (cooldownUntil.get(key) || 0) > Date.now();
}

// Enfría un modelo que falló: pasa al final de la cadena durante un rato. NO se
// descarta: si todos están fríos, igual se intentan (evita un falso "sin modelos").
function coolModel(key, label) {
  cooldownUntil.set(key, Date.now() + aiModelCooldownMs);
  const segundos = Math.round(aiModelCooldownMs / 1000);
  console.warn(`[ai:${label}] ${key} pasa a enfriamiento por ${segundos}s`);
}

// Cadena utilizable para la capacidad pedida: se descartan los motores sin
// credencial y los que no aceptan el tipo de contenido. Los fríos van al final.
function attemptPlan(entries, rounds, requirement) {
  const usables = entries.filter((e) => {
    const provider = getProvider(e.provider);
    return provider && provider.accepts.includes(requirement);
  });

  const calientes = [];
  const frios = [];
  for (const e of usables) (isCooling(keyOf(e)) ? frios : calientes).push(e);
  const orden = calientes.concat(frios);

  const plan = [];
  for (let ronda = 1; ronda <= rounds; ronda++) {
    for (const entry of orden) plan.push(entry);
  }
  return plan;
}

function noProviderError(requirement) {
  const error = new Error(
    requirement === "pdf"
      ? "Este CV es escaneado (o su layout no se pudo leer como texto) y necesita el motor con visión, que ahora no está disponible. Intentá más tarde."
      : "No hay ningún motor de IA configurado. Revisá las credenciales en .env."
  );
  error.status = 503;
  // Marca que el mensaje ya es apto para mostrar (no lo pisa el genérico de 503).
  error.userFacing = true;
  return error;
}

/* ---------------- Logs de latencia ---------------- */
// Permiten ver DÓNDE se va el tiempo: ms totales y tokens de "pensamiento"
// (thoughtsTokens) vs. tokens de salida. No cuestan cuota.
function logOk(label, usage, ms, key) {
  const u = usage || {};
  const thoughts = u.thoughtsTokens != null ? ` pensados=${u.thoughtsTokens}` : "";
  const entrada = u.promptTokens != null ? u.promptTokens : "?";
  const salida = u.outputTokens != null ? u.outputTokens : "?";
  console.log(`[ai:${label}] ok en ${ms}ms (${key})${thoughts} entrada=${entrada} salida=${salida}`);
}

function logFail(label, error, ms, key) {
  const msg = (error && error.message) || error;
  const quien = key ? ` (${key})` : "";
  console.error(`[ai:${label}] error en ${ms}ms${quien} (status ${statusOf(error) || "?"}): ${msg}`);
}

/* ---------------- API pública ---------------- */

// Genera texto. Acepta systemInstruction, responseSchema (JSON), files (PDF inline)
// y los controles de latencia: models, thinkingLevel / thinkingBudget, timeoutMs.
//
// Failover: recorre la cadena de motores; si uno está saturado (503), con la cuota
// diaria agotada (429) o fue retirado (404), pasa al siguiente sin cortar la
// consulta. Un 401/403/400 es fatal y no se reintenta. Si el pedido lleva un PDF,
// se omiten los motores que no leen PDF (p. ej. Groq).
async function generateResponse(message, opts = {}) {
  const { files, model, models, label = "generate" } = opts;
  const requirement = requiredCapability(opts);
  const req = {
    message,
    systemInstruction: opts.systemInstruction,
    responseSchema: opts.responseSchema,
    files,
    thinkingLevel: opts.thinkingLevel,
    thinkingBudget: opts.thinkingBudget,
    maxOutputTokens: opts.maxOutputTokens,
    timeoutMs: opts.timeoutMs,
  };

  const plan = attemptPlan(chainOf(models, model), aiFailoverRounds, requirement);
  if (!plan.length) throw noProviderError(requirement);

  const started = Date.now();
  let lastError = null;

  for (const entry of plan) {
    if (Date.now() - started >= aiTotalTimeoutMs) break;
    const provider = getProvider(entry.provider);
    const key = keyOf(entry);
    let sameRetries = 0;

    for (;;) {
      try {
        const { text, usage } = await provider.generate(entry.model, req);
        logOk(label, usage, Date.now() - started, key);
        return text;
      } catch (error) {
        lastError = error;
        const action = classifyAiError(error);
        if (action === "fatal") {
          logFail(label, error, Date.now() - started, key);
          throw error;
        }
        if (action === "retry-same" && sameRetries < aiSameModelRetries) {
          sameRetries++;
          const wait = 800 * sameRetries;
          console.warn(
            `[ai:${label}] ${key} error transitorio (status ${statusOf(error) || "red"}); reintento en ${wait}ms`
          );
          await sleep(wait);
          continue;
        }
        coolModel(key, label);
        console.warn(`[ai:${label}] ${key} falló (status ${statusOf(error) || "?"}); paso al siguiente motor.`);
        break; // siguiente motor de la cadena
      }
    }
  }

  logFail(label, lastError, Date.now() - started);
  throw lastError || new Error("No se pudo obtener respuesta de la IA.");
}

// Igual que generateResponse pero en streaming. Cede eventos:
//   { type: "delta",  text }                 → fragmento para mostrar
//   { type: "notice", message }              → aviso suave (cambio de motor sin texto aún)
//   { type: "restart", message, model }      → descartar lo mostrado y reiniciar
//
// Si un motor falla DESPUÉS de haber emitido texto, el texto parcial ya no sirve:
// se avisa con "restart" (el frontend vacía la burbuja) y se sigue con el próximo.
// Si falla ANTES de emitir, el cambio es silencioso (solo "notice").
async function* generateResponseStream(message, opts = {}) {
  const { files, model, models, label = "stream" } = opts;
  const requirement = requiredCapability(opts);
  const req = {
    message,
    systemInstruction: opts.systemInstruction,
    responseSchema: opts.responseSchema,
    files,
    thinkingLevel: opts.thinkingLevel,
    thinkingBudget: opts.thinkingBudget,
    maxOutputTokens: opts.maxOutputTokens,
    timeoutMs: opts.timeoutMs,
  };

  const plan = attemptPlan(chainOf(models, model), aiFailoverRounds, requirement);
  if (!plan.length) throw noProviderError(requirement);

  const started = Date.now();
  let lastError = null;
  let alreadyEmitted = false; // ya se mostró algo de un motor previo

  for (let i = 0; i < plan.length; i++) {
    const entry = plan[i];
    const key = keyOf(entry);
    const hasMore = i < plan.length - 1;
    if (Date.now() - started >= aiTotalTimeoutMs) break;

    const provider = getProvider(entry.provider);
    let emittedHere = false;
    let sameRetries = 0;

    // Reintentos del MISMO motor (429 por minuto o caída de conexión) mientras no se
    // haya emitido texto: si ya hay texto, reintentar duplicaría la respuesta.
    for (;;) {
      if (Date.now() - started >= aiTotalTimeoutMs) break;
      emittedHere = false;
      try {
        const iterator = provider.stream(entry.model, req)[Symbol.asyncIterator]();
        let step;
        for (;;) {
          step = await iterator.next();
          if (step.done) break;
          const piece = step.value && step.value.text;
          if (piece) {
            emittedHere = true;
            alreadyEmitted = true;
            yield { type: "delta", text: piece };
          }
        }
        logOk(label, step.value, Date.now() - started, key);
        return;
      } catch (error) {
        lastError = error;
        const action = classifyAiError(error);
        if (action === "fatal") {
          logFail(label, error, Date.now() - started, key);
          throw error;
        }

        if (action === "retry-same" && !emittedHere && sameRetries < aiSameModelRetries) {
          sameRetries++;
          const wait = 800 * sameRetries;
          console.warn(
            `[ai:${label}] ${key} error transitorio (status ${statusOf(error) || "red"}); reintento en ${wait}ms`
          );
          await sleep(wait);
          continue;
        }

        coolModel(key, label);
        console.warn(`[ai:${label}] ${key} falló (status ${statusOf(error) || "?"}); paso al siguiente motor.`);

        if (emittedHere && hasMore) {
          yield {
            type: "restart",
            model: key,
            message: "Se cortó la respuesta a mitad; reinicio con otro modelo.",
          };
        } else if (!alreadyEmitted && hasMore) {
          yield { type: "notice", message: "El modelo estaba ocupado; probando otro…" };
        }
        break;
      }
    }
  }

  logFail(label, lastError, Date.now() - started);
  throw lastError || new Error("No se pudo obtener respuesta de la IA.");
}

async function embedTexts(texts) {
  const ai = await geminiProvider.getClient();
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
  const ai = await geminiProvider.getClient();
  const response = await ai.models.list();
  for await (const model of response) {
    console.log(model.name);
  }
}

// Traduce un error de la IA a un mensaje para el usuario.
function friendlyAiError(error) {
  if (!error) return null;
  if (error.userFacing) return error.message;
  const status = statusOf(error);

  if (status === 429) return "Se alcanzó el límite de uso de la IA. Probá de nuevo más tarde.";
  if (status === 503) return "El servicio de IA está saturado. Probá de nuevo en unos segundos.";
  if (status === 504) return "La IA tardó demasiado en responder. Probá de nuevo.";
  if (status === 401 || status === 403) {
    return "La credencial de la IA no es válida o no tiene permisos.";
  }
  if (isConnectionError(error)) {
    return "No se pudo conectar con la IA (posible corte de red). Probá de nuevo.";
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
