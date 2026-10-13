const { aiQuotaSwitchSeconds } = require("../config");

// Helpers de clasificación de errores de IA, comunes a todos los motores.
// Los adaptadores normalizan sus errores a algo con `.status` numérico.

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

// Segundos que la API sugiere esperar: header Retry-After (ms ya convertidos en
// retryAfterMs) o el texto "retryDelay"/"retry in 12.3s" del cuerpo.
function retryDelaySeconds(error) {
  if (error && typeof error.retryAfterMs === "number" && error.retryAfterMs > 0) {
    return error.retryAfterMs / 1000;
  }
  const m = String((error && error.message) || "");
  let found = /"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i.exec(m);
  if (found) return Number(found[1]);
  found = /retry in (\d+(?:\.\d+)?)s/i.exec(m);
  if (found) return Number(found[1]);
  return null;
}

// ¿El 429 es por cuota diaria agotada (no se destraba esperando)?
function isDailyQuota(error) {
  const m = String((error && error.message) || "");
  if (/per day|perday|daily|por d[ií]a|requests per day|tokens per day/i.test(m)) return true;
  const segundos = retryDelaySeconds(error);
  return segundos != null && segundos >= aiQuotaSwitchSeconds;
}

// Qué hacer ante un error de la IA (define el failover):
//   "retry-same": límite por minuto; conviene esperar y reintentar el mismo modelo.
//   "next-model": saturado / cuota diaria / modelo retirado / corte de red.
//   "fatal": no se arregla reintentando (credencial, pedido inválido, sin saldo).
function classifyAiError(error) {
  const status = statusOf(error);
  if (status === 429) return isDailyQuota(error) ? "next-model" : "retry-same";
  if (status === 400 || status === 401 || status === 403 || status === 422) return "fatal";
  // 402 (sin saldo), 404 (modelo retirado), 5xx, cortes de red y errores sin
  // código: probar otro modelo. Es el caso por defecto.
  return "next-model";
}

// Errores transitorios que vale la pena reintentar (embeddings, sin respaldo).
function isRetriableAiError(error) {
  const status = statusOf(error);
  if (status === 429 || status === 500 || status === 503 || status === 504) return true;
  const m = String((error && error.message) || "");
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|saturado/i.test(m);
}

module.exports = { statusOf, retryDelaySeconds, isDailyQuota, classifyAiError, isRetriableAiError };
