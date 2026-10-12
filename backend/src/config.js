require("dotenv").config();

module.exports = {
  port: process.env.PORT || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  geminiEmbedModel: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
  embedDimensions: 768,
};