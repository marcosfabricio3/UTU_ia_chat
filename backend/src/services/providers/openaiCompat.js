const config = require("../../config");

// Motor genérico compatible con la API de OpenAI (Groq, OpenRouter, etc.).
// Acepta SOLO texto: no lee PDF, por eso para CVs escaneados el orquestador lo
// omite (se manda el PDF a Gemini). Se crea uno por proveedor.

function createOpenAiCompat({ id, baseUrl, apiKey }) {
  function headers() {
    const h = { "Content-Type": "application/json" };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    if (id === "openrouter") {
      h["HTTP-Referer"] = "https://localhost/cvlight";
      h["X-Title"] = "CVlight";
    }
    return h;
  }

  function buildMessages(req) {
    const messages = [];
    if (req.systemInstruction) messages.push({ role: "system", content: req.systemInstruction });
    messages.push({ role: "user", content: req.message });
    return messages;
  }

  function buildBody(model, req, stream, withSchema) {
    const body = { model, messages: buildMessages(req), stream: !!stream };
    if (req.responseSchema && withSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "respuesta", schema: req.responseSchema },
      };
    }
    if (req.maxOutputTokens) body.max_tokens = req.maxOutputTokens;
    return body;
  }

  // Si el proveedor no soporta `response_format` con esquema, se reintenta sin él
  // (el prompt ya pide JSON; el llamador limpia los cercos de markdown).
  function isSchemaUnsupported(error) {
    if (Number(error && error.status) !== 400) return false;
    return /response_format|json_schema|json mode|structured/i.test(String((error && error.message) || ""));
  }

  async function errorFrom(res) {
    let body = "";
    try {
      body = await res.text();
    } catch (e) {
      /* sin cuerpo */
    }
    const error = new Error(`[${id}] HTTP ${res.status}: ${body.slice(0, 300)}`);
    error.status = res.status;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter && !Number.isNaN(Number(retryAfter))) error.retryAfterMs = Number(retryAfter) * 1000;
    return error;
  }

  // Hace el POST con timeout REAL: el controller vive hasta que el consumidor
  // termina de leer el cuerpo (un stream colgado también se corta a los X ms).
  // Devuelve { res, done } — `done()` libera el timer.
  async function call(model, req, withSchema, stream) {
    const controller = new AbortController();
    const timeout = Number(req.timeoutMs) > 0 ? Number(req.timeoutMs) : config.aiRequestTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeout);
    const done = () => clearTimeout(timer);

    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(buildBody(model, req, stream, withSchema)),
        signal: controller.signal,
      });
    } catch (error) {
      done();
      // Un abort por timeout se reporta como 504 (mismo tratamiento que Gemini).
      if (error && (error.name === "AbortError" || controller.signal.aborted)) {
        const e = new Error(`[${id}] timeout tras ${timeout}ms`);
        e.status = 504;
        throw e;
      }
      throw error;
    }
    return { res, done };
  }

  async function generate(model, req) {
    let withSchema = !!req.responseSchema;
    for (;;) {
      try {
        const { res, done } = await call(model, req, withSchema, false);
        try {
          if (!res.ok) throw await errorFrom(res);
          const data = await res.json();
          const text = (data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : "") || "";
          return {
            text,
            usage: {
              promptTokens: data && data.usage ? data.usage.prompt_tokens : undefined,
              outputTokens: data && data.usage ? data.usage.completion_tokens : undefined,
            },
          };
        } finally {
          done();
        }
      } catch (error) {
        if (withSchema && isSchemaUnsupported(error)) {
          withSchema = false;
          continue;
        }
        throw error;
      }
    }
  }

  async function* stream(model, req) {
    let withSchema = !!req.responseSchema;
    for (;;) {
      try {
        const { res, done } = await call(model, req, withSchema, true);
        try {
          if (!res.ok) throw await errorFrom(res);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          const usage = {};
          try {
            for (;;) {
              const { done: eof, value } = await reader.read();
              if (eof) break;
              buffer += decoder.decode(value, { stream: true });
              let idx;
              while ((idx = buffer.indexOf("\n")) >= 0) {
                let line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                line = line.replace(/\r$/, "");
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") return usage;
                if (!payload) continue;
                try {
                  const json = JSON.parse(payload);
                  const delta = json.choices && json.choices[0] && json.choices[0].delta;
                  if (delta && delta.content) yield { text: delta.content };
                  if (json.usage) {
                    usage.promptTokens = json.usage.prompt_tokens;
                    usage.outputTokens = json.usage.completion_tokens;
                  }
                } catch (e) {
                  /* fragmento parcial: se ignora */
                }
              }
            }
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              /* nada */
            }
          }
          return usage;
        } finally {
          done();
        }
      } catch (error) {
        if (withSchema && isSchemaUnsupported(error)) {
          withSchema = false;
          continue;
        }
        throw error;
      }
    }
  }

  return { id, accepts: ["text"], supportsThinking: false, generate, stream };
}

module.exports = { createOpenAiCompat };