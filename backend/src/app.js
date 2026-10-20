const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

require("dotenv").config();
const config = require("./config");

// Rutas
const chatRoutes = require("./routes/chat.routes");
const jobsRoutes = require("./routes/jobs.routes");

// Token de API opcional para proteger las mutaciones/calls de IA.
// Si no se define API_TOKEN en .env, se genera uno aleatorio al arrancar y se
// imprime en consola: el frontend lo pide a GET /api/session.
if (!process.env.API_TOKEN || !process.env.API_TOKEN.trim()) {
  process.env.API_TOKEN = crypto.randomBytes(32).toString("hex");
  console.log(`[CVlight] API_TOKEN generado (solo esta ejecución): ${process.env.API_TOKEN}`);
  console.log("[CVlight] Añadilo a backend/.env como API_TOKEN=... para que no cambie al reiniciar.");
}

const API_TOKEN = String(process.env.API_TOKEN).trim();

// Creamos la aplicación
const app = express();

const ALLOWED_ORIGINS = (() => {
  const raw = process.env.ALLOWED_ORIGINS || "";
  const fromEnv = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000", "null"];
  return fromEnv.length ? fromEnv : defaults;
})();

// CORS restringido: solo desde el frontend servido por este backend (o file://).
app.use(
  cors({
    origin: (origin, cb) => {
      // Peticiones sin Origin (curl, mismo origen) o con origen permitido → OK.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (origin === "null" && ALLOWED_ORIGINS.includes("null")) return cb(null, true);
      return cb(null, false);
    },
  })
);

// Deshabilitamos cabecera X-Powered-By
app.disable("x-powered-by");

// Le dice a Express que reciba información en formato JSON.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Rutas de la API (protegidas por token; /api/session queda fuera)
app.use("/api", requireApiToken);
app.use("/api/jobs", jobsRoutes);
app.use("/api/chat", chatRoutes);

// Frontend CVlight servido en /app (para la demo).
// La API queda en /api, así que esto no interfiere.
app.use("/app", express.static(path.join(__dirname, "..", "..", "frontend")));

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a || "");
  const bb = Buffer.from(b || "");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireApiToken(req, res, next) {
  // Cuando se monta con app.use("/api", ...) req.baseUrl="/api" y req.path ya viene recortado.
  const base = req.baseUrl || "";
  const p = req.path || "";
  // GET /api/session no necesita token (lo entrega solo a orígenes permitidos)
  if (base === "/api" && p === "/session") {
    return next();
  }
  // Exigir token a todo lo demás bajo /api
  if (base === "/api") {
    const token = (req.headers["x-api-key"] || req.headers["authorization"] || "").toString().trim();
    if (!token) {
      return res.status(401).json({ success: false, message: "Token de API requerido (X-API-Key)." });
    }
    if (!timingSafeEqual(token, API_TOKEN)) {
      return res.status(403).json({ success: false, message: "Token de API inválido." });
    }
    return next();
  }
  // Si se monta a nivel raíz (defensivo), excluir solo /api/session
  if (p === "/api/session" || (req.method === "GET" && p === "/")) {
    return next();
  }
  // Por si acaso, no exigir fuera de /api
  if (!p.startsWith("/api")) {
    return next();
  }
  const token2 = (req.headers["x-api-key"] || req.headers["authorization"] || "").toString().trim();
  if (!token2) {
    return res.status(401).json({ success: false, message: "Token de API requerido (X-API-Key)." });
  }
  if (!timingSafeEqual(token2, API_TOKEN)) {
    return res.status(403).json({ success: false, message: "Token de API inválido." });
  }
  next();
}

function sameOriginOrAllowed(req) {
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const same = (host === "localhost" || host === "127.0.0.1") && port === String(config.port);
    if (same) return true;
  } catch (e) {}
  return ALLOWED_ORIGINS.some((o) => {
    if (o === "null") return origin.startsWith("null") || origin === "null";
    try {
      const u = new URL(o);
      return origin.startsWith(o);
    } catch (e) {
      return origin.includes(o);
    }
  });
}

// Entrega el token de sesión solo a peticiones que provienen del mismo origen
// (front servido por el backend) o a orígenes permitidos (file://). Esto evita
// que páginas externas lo lean desde otro sitio.
app.get("/api/session", (req, res) => {
  if (!sameOriginOrAllowed(req)) {
    return res.status(403).json({ success: false, message: "Origen no permitido para obtener el token." });
  }
  res.json({ success: true, token: API_TOKEN });
});

// Ruta inicial / health.
app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "CVlight API",
    message: "API de CVlight en funcionamiento.",
  });
});

// Manejo de errores (ej. subir un archivo que no es PDF).
app.use((err, req, res, next) => {
  // Si multer alcanzó a escribir archivos antes de fallar, no los dejamos huérfanos.
  for (const file of (req && req.files) || []) {
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      /* nada: el archivo ya no estaba */
    }
  }

  // Errores 500 → mensaje genérico; el stack va al log (no se filtra por completo)
  const isServerError = !err.status || err.status >= 500;
  console.error("Error:", err.message);
  if (err.stack) {
    // Log stack para diagnóstico, sin enviarlo al cliente
    console.error(err.stack);
  }
  res.status(err.status || 400).json({
    success: false,
    message: isServerError ? "Error interno del servidor." : err.message || "Error en la petición.",
  });
});

// Handlers de proceso para evitar caídas silenciosas
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // No hacemos process.exit en modo demo; solo registramos
});
process.on("SIGINT", () => {
  process.exit(0);
});
process.on("SIGTERM", () => {
  process.exit(0);
});

// Iniciar servidor
app.listen(config.port, () => {
  console.log(`Servidor ejecutándose en http://localhost:${config.port}`);
});
