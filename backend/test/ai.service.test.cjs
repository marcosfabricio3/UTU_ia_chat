// Tests del orquestador de IA (failover, capacidades, streaming) usando el
// adaptador compatible con OpenAI (Groq) y un `fetch` falso. No toca la red.
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || "clave-de-prueba";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const realFetch = globalThis.fetch;
let handler = () => new Response("sin handler", { status: 500 });

// Enruta las llamadas del adaptador (Groq) al handler del test actual.
globalThis.fetch = async (url, init) => {
  const u = typeof url === "string" ? url : url.url || String(url);
  if (!u.includes("groq.com")) return realFetch(url, init);
  const body = init && init.body ? JSON.parse(init.body) : {};
  return handler(body, init);
};

const { generateResponse, generateResponseStream } = require("../src/services/ai.service");

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function textResponse(text) {
  return jsonResponse({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 1, completion_tokens: 2 },
  });
}

// Respuesta SSE con fragmentos; opcionalmente falla (corta la conexión) al final.
function sseResponse(chunks, { failAfter = false } = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
        return;
      }
      if (failAfter) {
        controller.error(new Error("corte de red simulado"));
        return;
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function deltaChunk(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

async function collect(gen) {
  const out = [];
  for await (const evt of gen) out.push(evt);
  return out;
}

test("failover: 503 en el primero, responde el segundo", async () => {
  handler = (body) =>
    body.model === "fa-a" ? jsonResponse({ error: { message: "unavailable" } }, 503) : textResponse("B");
  const out = await generateResponse("x", {
    models: [{ provider: "groq", model: "fa-a" }, { provider: "groq", model: "fa-b" }],
  });
  assert.strictEqual(out, "B");
});

test("fatal (401): no se intenta el siguiente", async () => {
  let calls = 0;
  handler = () => {
    calls++;
    return jsonResponse({ error: { message: "invalid api key" } }, 401);
  };
  await assert.rejects(() =>
    generateResponse("x", {
      models: [{ provider: "groq", model: "f-a" }, { provider: "groq", model: "f-b" }],
    })
  );
  assert.strictEqual(calls, 1);
});

test("429 por minuto: reintenta el MISMO modelo", async () => {
  let aCalls = 0;
  handler = (body) => {
    if (body.model === "rs-a") {
      aCalls++;
      if (aCalls === 1) return jsonResponse({ error: { message: "Rate limit reached for requests per minute (RPM)" } }, 429);
      return textResponse("A");
    }
    return textResponse("B");
  };
  const out = await generateResponse("x", {
    models: [{ provider: "groq", model: "rs-a" }, { provider: "groq", model: "rs-b" }],
  });
  assert.strictEqual(out, "A");
  assert.strictEqual(aCalls, 2);
});

test("429 de cuota diaria: salta al siguiente sin reintentar", async () => {
  let aCalls = 0;
  handler = (body) => {
    if (body.model === "dq-a") {
      aCalls++;
      return jsonResponse({ error: { message: "Rate limit reached on requests per day (RPD)" } }, 429);
    }
    return textResponse("B");
  };
  const out = await generateResponse("x", {
    models: [{ provider: "groq", model: "dq-a" }, { provider: "groq", model: "dq-b" }],
  });
  assert.strictEqual(out, "B");
  assert.strictEqual(aCalls, 1);
});

test("capacidad: un pedido con PDF no usa un motor de solo texto", async () => {
  let calls = 0;
  handler = () => {
    calls++;
    return textResponse("no debería llamarse");
  };
  await assert.rejects(
    generateResponse("x", {
      files: [{ path: path.join(__dirname, "scanned.pdf"), mimeType: "application/pdf" }],
      models: [{ provider: "groq", model: "cap" }],
    }),
    (e) => e.status === 503
  );
  assert.strictEqual(calls, 0);
});

test("stream: falla a mitad → restart y sigue con otro motor", async () => {
  handler = (body) =>
    body.model === "s-a"
      ? sseResponse([deltaChunk("parcial")], { failAfter: true })
      : sseResponse([deltaChunk("B"), "data: [DONE]\n\n"]);
  const events = await collect(
    generateResponseStream("hola", {
      models: [{ provider: "groq", model: "s-a" }, { provider: "groq", model: "s-b" }],
    })
  );
  const deltas = events.filter((e) => e.type === "delta").map((e) => e.text);
  assert.deepEqual(deltas, ["parcial", "B"]);
  assert.ok(events.some((e) => e.type === "restart"), "debe avisar restart tras texto parcial");
});

test("stream: falla antes de emitir → notice silencioso", async () => {
  handler = (body) =>
    body.model === "n-a"
      ? jsonResponse({ error: { message: "overloaded" } }, 503)
      : sseResponse([deltaChunk("B"), "data: [DONE]\n\n"]);
  const events = await collect(
    generateResponseStream("hola", {
      models: [{ provider: "groq", model: "n-a" }, { provider: "groq", model: "n-b" }],
    })
  );
  assert.ok(events.some((e) => e.type === "notice"), "debe avisar con notice");
  assert.ok(!events.some((e) => e.type === "restart"), "sin texto no hace falta restart");
  const deltas = events.filter((e) => e.type === "delta").map((e) => e.text);
  assert.deepEqual(deltas, ["B"]);
});

test("esquema no soportado (400 de response_format): reintenta sin el esquema", async () => {
  let calls = 0;
  let primerBody = null;
  let segundoBody = null;
  handler = (body) => {
    calls++;
    if (calls === 1) {
      primerBody = body;
      return jsonResponse({ error: { message: "response_format json_schema is not supported" } }, 400);
    }
    segundoBody = body;
    return textResponse("OK");
  };
  const out = await generateResponse("x", {
    responseSchema: { type: "object", properties: { a: { type: "string" } } },
    models: [{ provider: "groq", model: "sch" }],
  });
  assert.strictEqual(out, "OK");
  assert.ok(primerBody.response_format, "el primer intento sí lleva el esquema");
  assert.strictEqual(segundoBody.response_format, undefined, "el reintento va sin esquema");
});

test("caída de conexión: reintenta el MISMO motor antes de saltar", async () => {
  let aCalls = 0;
  let bCalls = 0;
  handler = (body) => {
    if (body.model === "net-a") {
      aCalls++;
      if (aCalls === 1) throw new TypeError("fetch failed"); // corte de red
      return textResponse("A");
    }
    bCalls++;
    return textResponse("B");
  };
  const out = await generateResponse("x", {
    models: [{ provider: "groq", model: "net-a" }, { provider: "groq", model: "net-b" }],
  });
  assert.strictEqual(out, "A", "gana el mismo motor tras el reintento");
  assert.strictEqual(aCalls, 2);
  assert.strictEqual(bCalls, 0, "no debe saltar de motor por un corte transitorio");
});

test("stream: caída de conexión antes de emitir → reintenta el mismo motor", async () => {
  let aCalls = 0;
  handler = (body) => {
    if (body.model === "snet-a") {
      aCalls++;
      if (aCalls === 1) throw new TypeError("fetch failed");
      return sseResponse([deltaChunk("A"), "data: [DONE]\n\n"]);
    }
    return sseResponse([deltaChunk("B"), "data: [DONE]\n\n"]);
  };
  const events = await collect(
    generateResponseStream("hola", {
      models: [{ provider: "groq", model: "snet-a" }, { provider: "groq", model: "snet-b" }],
    })
  );
  const deltas = events.filter((e) => e.type === "delta").map((e) => e.text);
  assert.deepEqual(deltas, ["A"]);
  assert.strictEqual(aCalls, 2);
  assert.ok(!events.some((e) => e.type === "notice"), "no debería saltar de motor");
});
