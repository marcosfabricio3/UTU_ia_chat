const express = require("express");
const { generateResponse, listModels } = require("../services/gemini.service");
const { rateLimit } = require("../middleware/rate-limit");

const router = express.Router();

// Limita el chat para no quemar la cuota de la IA.
const chatLimit = rateLimit({ max: 30 });

// Chat "suelto" de la plantilla original (sin RAG). El chat real de CVlight es
// POST /api/jobs/:id/chat. Se conserva como referencia y para el diagnóstico de modelos.
router.post("/", chatLimit, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "El mensaje no puede estar vacío.",
      });
    }

    const response = await generateResponse(message);

    res.json({
      success: true,
      response,
    });
  } catch (error) {
    console.error("Error al consultar Gemini:", error.message);

    res.status(500).json({
      success: false,
      message: "No se pudo obtener una respuesta de la IA.",
    });
  }
});

// Diagnóstico: imprime en consola los modelos disponibles.
router.get("/models", async (req, res) => {
  try {
    await listModels();

    res.json({
      success: true,
      message: "Modelos mostrados en la consola.",
    });
  } catch (error) {
    console.error("Error al listar modelos:", error.message);

    res.status(500).json({
      success: false,
      message: "No se pudieron obtener los modelos.",
    });
  }
});

module.exports = router;
