# CVlight — Análisis y ranking de CVs con IA

Aplicación de demostración para **Talento Humano S.A.**: se cargan vacantes, se
suben los CV en PDF y la IA puntúa a cada candidato contra la vacante. Genera un
**ranking justificable** (score, fortalezas, brechas y recomendación) y permite
**consultar los CVs por chat** (RAG) con respuestas citadas.

> Los resultados son una ayuda: la decisión final siempre es humana.

---

## Stack

- **Backend:** Node.js + Express 5. Estado en un JSON (`backend/src/data/jobs.json`).
- **IA:** dos motores con **failover** entre ellos:
  - **Google Gemini** (`@google/genai`) — único con **visión** (lee el PDF nativo), para
    CVs escaneados; y `embedContent` para los embeddings del chat (RAG).
  - **Groq** (API compatible con OpenAI) — motor de **texto** con cuota diaria amplia;
    recibe el texto del CV extraído localmente.
  El texto del PDF se extrae en el backend con **`pdfjs-dist`**: si el CV está a **dos
  columnas**, las detecta y **reordena** antes de mandarlo.
- **Frontend:** HTML + CSS + **JavaScript vanilla**, sin paso de build ni
  dependencias. Se sirve como estático desde `/app`.
- **Fuentes e iconos self-hosted**: la demo funciona sin internet (salvo la IA).

## Requisitos

- Node.js 18+ (usa `import()` dinámico de ESM desde CommonJS).
- Una API key de Gemini en un archivo `.env` (ver abajo). La de **Groq es opcional**:
  si falta, el motor se omite de las cadenas sin romper nada.

## Cómo levantar

```bash
# 1) dependencias del backend
cd backend
npm install

# 2) variables de entorno
cp .env.example .env      # en Windows: copy .env.example .env
#   completá GEMINI_API_KEY (y, opcional, GROQ_API_KEY)

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
| `GROQ_API_KEY` | — (opcional) | Credencial de Groq; sin ella, el motor se omite |
| `PORT` | `3000` | Puerto del servidor |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Modelo de texto del **scoring** (batch) |
| `AI_SUGGEST_MODELS` | Groq + respaldos Gemini | Cadena de motores de **Autocompletar** (orden de preferencia) |
| `AI_CHAT_MODELS` | Groq + respaldos Gemini | Cadena de motores del **chat** |
| `AI_SCORING_MODELS` | Gemini + Groq al final | Cadena de motores del **scoring** |
| `GEMINI_SUGGEST_MODEL` / `GEMINI_CHAT_MODEL` | `GEMINI_MODEL` | Modelo único de cada tarea (si no hay cadena `*_MODELS`) |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | Modelo de embeddings (siempre Gemini) |
| `AI_PDF_MODE` | `auto` | `auto` = extrae texto local (y PDF nativo si es escaneado); `pdf` = siempre nativo |
| `PDF_MIN_TEXT_CHARS` | `150` | Mínimo de texto extraído para considerarlo útil (si no, se manda el PDF nativo) |
| `GEMINI_THINKING_LEVEL_{SUGGEST,CHAT,SCORING}` | `low`, `low`, `high` | Razonamiento de Gemini 3 (`low` = más rápido); Groq lo ignora |
| `AI_REQUEST_TIMEOUT_MS` | `45000` | Corte por intento contra la IA (ms) |
| `AI_TOTAL_TIMEOUT_MS` | `120000` | Tope total por consulta/CV, sumando intentos (ms) |
| `AI_FAILOVER_ROUNDS` | `2` | Vueltas a la cadena antes de rendirse |
| `AI_MODEL_COOLDOWN_MS` | `45000` | Enfriamiento de un motor que falló (circuit breaker) |
| `AI_SAME_MODEL_RETRIES` | `1` | Reintentos del mismo motor ante 429 por minuto |
| `AI_QUOTA_SWITCH_SECONDS` | `60` | RetryDelay desde el que se considera cuota agotada (salta de motor) |
| `GEMINI_RETRIES_BATCH` | `3` | Reintentos de **embeddings** ante 503/429 |

> Los nombres viejos `GEMINI_{SUGGEST,CHAT,SCORING}_MODELS` siguen leyéndose si no hay
> `AI_*_MODELS`. Cada entrada de cadena es `modelo` (Gemini) o `proveedor:modelo`
> (p. ej. `groq:openai/gpt-oss-120b`).

**Failover de motores:** si el primero de la cadena está saturado (`503`), tiene la
cuota diaria agotada (`429`) o fue retirado (`404`), se pasa al siguiente **sin
cortar la consulta**. Un `401/403/400` es fatal y no se reintenta. Un **corte de
conexión** (sin respuesta HTTP, p. ej. un proxy TLS intermitente) se **reintenta en
el mismo motor** antes de saltar, para no gastar la cuota del respaldo por un
problema de red local.
Un motor que falla se enfría (pasa al final de la cadena) durante `AI_MODEL_COOLDOWN_MS`.
Un pedido que lleva el **PDF adjunto** saltea los motores que no leen PDF (Groq): el
orquestador filtra por capacidad. La cadena de Gemini termina en `gemini-3.1-flash-lite`,
cuyo bucket diario es independiente del de la familia 3.5/3.6/3.8.

**CVs escaneados:** si el PDF no tiene capa de texto, se manda el PDF nativo y lo
tiene que leer Gemini (único con visión). Si además Gemini está sin cuota, el CV
queda pendiente con un aviso claro (*"…necesita el motor con visión…"*).

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/jobs` | Crear una vacante |
| `POST` | `/api/jobs/suggest` | **Autocompletar** una vacante con IA (requisitos + descripción) desde el título |
| `GET` | `/api/jobs` | Listar vacantes |
| `GET` | `/api/jobs/:id` | Ver una vacante |
| `DELETE` | `/api/jobs/:id` | Eliminar la vacante y los PDFs de sus CVs |
| `POST` | `/api/jobs/:id/cvs` | Subir CVs (multipart, campo `cvs`, solo PDF) |
| `DELETE` | `/api/jobs/:id/cvs/:cvId` | Eliminar un CV (registro + PDF) |
| `GET` | `/api/jobs/:id/cvs/:cvId/file` | Ver el PDF de un CV (inline) |
| `POST` | `/api/jobs/:id/analyze` | Puntuar los CVs **pendientes** (los ya analizados se saltan; `{ force: true }` re-analiza todo) |
| `GET` | `/api/jobs/:id/ranking` | Ranking ordenado + KPIs |
| `POST` | `/api/jobs/:id/chat` | Chat RAG sobre los CVs de la vacante |
| `POST` | `/api/jobs/:id/chat/stream` | Igual que el anterior, en **streaming (SSE)**: `sources` → (`notice`) → `delta`* → (`restart` → `delta`*) → `done` |
| `POST` | `/api/chat` | Chat suelto (plantilla original, sin RAG) |
| `GET` | `/api/chat/models` | Diagnóstico: lista los modelos en consola |

`POST /api/jobs/suggest`, `POST /api/jobs/:id/analyze`, `POST /api/jobs/:id/chat`
y `POST /api/jobs/:id/chat/stream` están limitados a **30 peticiones por minuto por IP**
para no agotar la cuota de la IA.

## Estructura

```
backend/
  package.json              # dependencias y scripts (start / dev / test)
  .env.example              # variables de entorno de ejemplo (copiar a .env)
  nodemon.json              # recarga automática en desarrollo
  src/
    app.js                  # servidor Express, CORS, estáticos, manejo de errores
    config.js               # carga el .env y expone puerto y modelos
    middleware/
      rate-limit.js         # limitador de peticiones en memoria
    routes/
      jobs.routes.js        # vacantes + upload + analizar + ranking + chat
      chat.routes.js        # chat "suelto" de la plantilla original (se conserva)
    services/
      ai.service.js         # orquestador: cadena de motores, failover, streaming
      providers/
        gemini.js           # motor Gemini (texto + PDF) y embeddings
        openaiCompat.js     # motor compatible con OpenAI (Groq/OpenRouter)
        index.js            # registro de motores según credenciales
      cv.js                 # regla única de "CV analizado" (score + vector)
      pdfText.js            # extrae el texto del PDF y reordena columnas
      scoring.service.js    # scoring de CVs y armado del ranking/KPIs
      retrieval.service.js  # embeddings + similitud coseno
      chat.service.js       # RAG: recuperar + armar contexto + responder
      store.service.js      # persistencia en JSON (escritura atómica)
    prompts/                # system prompts y esquema JSON del scoring
    data/                   # jobs.json + cvs/*.pdf  (runtime, gitignored)
  test/                     # tests (node:test) + fixtures PDF

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

cvs-ejemplo/                # 34 CVs de ejemplo por rol para probar
docs/                       # documentación del proyecto
```

## Datos y persistencia

- La fuente de verdad es `backend/src/data/jobs.json` (un JSON con las vacantes y
  sus CV: score, resumen, skills, vector y texto extraído).
- Los PDFs subidos viven en `backend/src/data/cvs/<uuid>.pdf`.
- `backend/src/data/` está **gitignoreado** (son datos de runtime).
- La carpeta `cvs-ejemplo/` trae 34 PDFs de ejemplo (agrupados por rol) para probar el flujo completo.

## Verificación rápida

1. Crear una vacante. Con sólo el **título**, el botón **Autocompletar** (IA) redacta los
   requisitos y la descripción.
2. Desplegarla, subir los PDFs de `cvs-ejemplo/` y pulsar **Analizar CVs**.
3. Ver el **Ranking** y abrir el PDF de un candidato con el ícono junto al nombre.
4. En **Chat**, preguntar p. ej. *"¿Quién tiene más experiencia con React?"*.

## Licencia

MIT — ver [`LICENSE`](LICENSE). Las tipografías incluidas son OFL (ver
`frontend/assets/fonts/licenses/`).
