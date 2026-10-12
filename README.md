# CVlight — Análisis y ranking de CVs con IA

Aplicación de demostración para **Talento Humano S.A.**: se cargan vacantes, se
suben los CV en PDF y la IA puntúa a cada candidato contra la vacante. Genera un
**ranking justificable** (score, fortalezas, brechas y recomendación) y permite
**consultar los CVs por chat** (RAG) con respuestas citadas.

> Los resultados son una ayuda: la decisión final siempre es humana.

---

## Stack

- **Backend:** Node.js + Express 5. Estado en un JSON (`backend/src/data/jobs.json`).
- **IA:** Google Gemini (`@google/genai`) — `generateContent` (scoring y chat) y
  `embedContent` (embeddings para la recuperación semántica del chat).
- **Frontend:** HTML + CSS + **JavaScript vanilla**, sin paso de build ni
  dependencias. Se sirve como estático desde `/app`.
- **Fuentes e iconos self-hosted**: la demo funciona sin internet (salvo la IA).

## Requisitos

- Node.js 18+ (usa `import()` dinámico de ESM desde CommonJS).
- Una API key de Gemini en un archivo `.env` (ver abajo).

## Cómo levantar

```bash
# 1) dependencias del backend
cd backend
npm install

# 2) variables de entorno
cp .env.example .env      # en Windows: copy .env.example .env
#   completá GEMINI_API_KEY

# 3) servidor
npm start        # o: npm run dev   (nodemon, recarga automática)
```

- **App:** http://localhost:3000/app/
- **API:** http://localhost:3000/api

El backend sirve el frontend, así que con un solo proceso alcanza. (El frontend
también se puede abrir con `file://` porque el backend tiene CORS abierto.)

## Variables de entorno (`backend/.env`)

| Variable | Por defecto | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | — (**obligatoria**) | Credencial de Gemini |
| `PORT` | `3000` | Puerto del servidor |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Modelo de texto (scoring y chat) |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | Modelo de embeddings |

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/jobs` | Crear una vacante |
| `GET` | `/api/jobs` | Listar vacantes |
| `GET` | `/api/jobs/:id` | Ver una vacante |
| `DELETE` | `/api/jobs/:id` | Eliminar la vacante y los PDFs de sus CVs |
| `POST` | `/api/jobs/:id/cvs` | Subir CVs (multipart, campo `cvs`, solo PDF) |
| `DELETE` | `/api/jobs/:id/cvs/:cvId` | Eliminar un CV (registro + PDF) |
| `GET` | `/api/jobs/:id/cvs/:cvId/file` | Ver el PDF de un CV (inline) |
| `POST` | `/api/jobs/:id/analyze` | Puntuar todos los CVs de la vacante |
| `GET` | `/api/jobs/:id/ranking` | Ranking ordenado + KPIs |
| `POST` | `/api/jobs/:id/chat` | Chat RAG sobre los CVs de la vacante |
| `POST` | `/api/chat` | Chat suelto (plantilla original, sin RAG) |
| `GET` | `/api/chat/models` | Diagnóstico: lista los modelos en consola |

`POST /api/jobs/:id/analyze` y `POST /api/jobs/:id/chat` están limitados a
**30 peticiones por minuto por IP** para no agotar la cuota de la IA.

## Estructura

```
backend/src/
  app.js                    # servidor Express, CORS, estáticos, manejo de errores
  config.js                 # carga el .env y expone puerto y modelos
  middleware/
    rate-limit.js           # limitador de peticiones en memoria
  routes/
    jobs.routes.js          # vacantes + upload + analizar + ranking + chat
    chat.routes.js          # chat "suelto" de la plantilla original (se conserva)
  services/
    gemini.service.js       # cliente Gemini: generateContent + embedContent
    scoring.service.js      # scoring de CVs y armado del ranking/KPIs
    retrieval.service.js    # embeddings + similitud coseno
    chat.service.js         # RAG: recuperar + armar contexto + responder
    store.service.js        # persistencia en JSON (escritura atómica)
  prompts/                  # system prompts y esquema JSON del scoring
  data/                     # jobs.json + cvs/*.pdf  (generado en runtime, gitignored)

frontend/
  index.html                # SPA con 3 vistas (Vacantes, Ranking, Chat)
  css/                      # tokens, base, background, blocks, views
  js/
    api.js                  # capa fetch al backend
    a11y.js                 # utilidades compartidas + patrón ARIA de pestañas
    ui.js                   # diálogo de confirmación (<dialog>)
    views/                  # vacantes.js, ranking.js, chat.js
    app.js                  # estado, router de pestañas, tema y toast
  assets/                   # fuentes, iconos y marca (self-hosted)

sample-cvs/                 # CVs de ejemplo para probar
docs/                       # documentación del proyecto
```

## Datos y persistencia

- La fuente de verdad es `backend/src/data/jobs.json` (un JSON con las vacantes y
  sus CV: score, resumen, skills, vector y texto extraído).
- Los PDFs subidos viven en `backend/src/data/cvs/<uuid>.pdf`.
- `backend/src/data/` está **gitignoreado** (son datos de runtime).
- La carpeta `sample-cvs/` trae PDFs de ejemplo para probar el flujo completo.

## Verificación rápida

1. Crear una vacante (o usar **Cargar ejemplo**).
- 2. Desplegarla, subir los PDFs de `sample-cvs/` y pulsar **Analizar CVs**.
- 3. Ver el **Ranking** y abrir el PDF de un candidato con el ícono junto al nombre.
- 4. En **Chat**, preguntar p. ej. *"¿Quién tiene más experiencia con React?"*.
