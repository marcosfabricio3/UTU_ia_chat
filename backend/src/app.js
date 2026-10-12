const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

// config.js carga el .env (única llamada a dotenv) y expone puerto y modelos.
const config = require("./config");

// Rutas
const chatRoutes = require("./routes/chat.routes");
const jobsRoutes = require("./routes/jobs.routes");

// Creamos la aplicación
const app = express();

// Permitir peticiones desde el frontend (incluye abrir la app con file://).
app.use(cors());

// Le dice a Express que reciba información en formato JSON.
// El chat manda el historial, así que el límite se deja holgado.
app.use(express.json({ limit: "1mb" }));

// Rutas de la API
app.use("/api/jobs", jobsRoutes);
app.use("/api/chat", chatRoutes);

// Frontend CVlight servido en /app (para la demo).
// La API queda en /api, así que esto no interfiere.
app.use("/app", express.static(path.join(__dirname, "..", "..", "frontend")));

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
  for (const file of req.files || []) {
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      /* nada: el archivo ya no estaba */
    }
  }

  console.error("Error:", err.message);
  res.status(err.status || 400).json({
    success: false,
    message: err.message || "Error en la petición.",
  });
});

// Iniciar servidor
app.listen(config.port, () => {
  console.log(`Servidor ejecutándose en http://localhost:${config.port}`);
});
