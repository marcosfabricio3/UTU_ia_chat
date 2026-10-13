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

// Error de CONEXIÓN: no llegó a haber respuesta HTTP (sin status). Ejemplos: DNS,
// TLS rechazado por un proxy que inspecciona HTTPS, conexión reseteada, `fetch failed`.
// Son transitorios: conviene reintentar el MISMO motor antes de saltar a otro, porque
// saltar por un problema de red local gastaría la cuota del motor de respaldo.
function isConnectionError(error) {
  if (statusOf(error)) return false;
  const cause = (error && error.cause && error.cause.code) || "";
  const msg = String((error && error.message) || "");
  // undici reporta los cortes como "fetch failed" (TypeError) o con un `cause.code`
  // de red. Se exige un patrón concreto: no cualquier TypeError es un corte.
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ECONNABORTED|SELF_SIGNED_CERT|UNABLE_TO_VERIFY|CERT_|socket hang up|other side closed/i.test(
    `${msg} ${cause}`
  );
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
  // Un problema de conexión (sin respuesta HTTP) se reintenta en el mismo motor un
  // par de veces antes de saltar: suele ser un corte transitorio de red/TLS.
  if (isConnectionError(error)) return "retry-same";
  // 402 (sin saldo), 404 (modelo retirado), 5xx y errores sin código: probar otro
  // modelo. Es el caso por defecto.
  return "next-model";
}

// Errores transitorios que vale la pena reintentar (embeddings, sin respaldo).
function isRetriableAiError(error) {
  const status = statusOf(error);
  if (status === 429 || status === 500 || status === 503 || status === 504) return true;
  if (isConnectionError(error)) return true;
  const m = String((error && error.message) || "");
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|saturado/i.test(m);
}

module.exports = {
  statusOf,
  retryDelaySeconds,
  isDailyQuota,
  isConnectionError,
  classifyAiError,
  isRetriableAiError,
};
