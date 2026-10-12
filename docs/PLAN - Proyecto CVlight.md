# Plan del Proyecto — "CVlight"

> Parcial 2 — Proyecto de Inteligencia Artificial
> Analizador y rankeador de CVs con chat inteligente sobre los candidatos.

---

## 1. Resumen de la consigna (PDF del parcial)

La entrega tiene dos partes: **un trabajo escrito** y **una demo funcional** (exposición de 5 a 10 minutos). Puntos a cubrir:

1. **Problema concreto** de una empresa real o ficticia abordable con IA.
2. **Propuesta de solución + justificación** de por qué la IA es adecuada.
3. **Desarrollo funcional** integrando un LLM (API/plataforma).
4. **Configuración y diseño del prompt**: rol, objetivo, contexto, estilo, restricciones y estructura esperada.
5. **Exposición** con demostración del funcionamiento.

> Nota: buena parte de la nota está en los puntos 1, 2 y 4 (problema + justificación + diseño del prompt).

---

## 2. Proyecto propuesto

**Nombre:** CVlight (empresa ficticia de RRHH: *"Talento Humano S.A."*).

### 2.1 Problema
La empresa recibe **cientos de CVs por búsqueda**. Un reclutador tarda horas filtrando a mano, el criterio **no es consistente** entre reclutadores y se pierden buenos candidatos. Además, comparar candidatos entre sí y responder preguntas puntuales ("¿quién tiene React y 3+ años?") obliga a releer todo el lote.

### 2.2 Solución + justificación de la IA
Una aplicación web donde el reclutador:

1. Crea una **vacante** (título, descripción, requisitos).
2. **Sube CVs** (PDF).
3. El LLM **puntúa cada CV** contra la vacante (0–100) y extrae datos → **ranking** automático con fortalezas y gaps.
4. **Chat sobre los CVs**: preguntas en lenguaje natural ("compará los 3 primeros", "¿quién conoce SQL?").

**Por qué IA:** los CVs son texto **no estructurado y heterogéneo**; el matching por palabras clave falla (sinónimos, redacciones distintas). Un LLM entiende el *significado*, evalúa semánticamente contra los requisitos y responde preguntas: algo inviable con reglas fijas.

### 2.3 Dos usos del LLM
- **Scoring estructurado:** devuelve **JSON** (score, resumen, fortalezas[], gaps[], skills coincidentes[], años de experiencia, recomendación).
- **Chat RAG:** responde preguntas usando los CVs como contexto y **cita de qué CV sacó cada dato**.

---

## 3. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Extracción de CV | **PDF directo a Gemini** (`inlineData`, mimeType `application/pdf`). Sin librería de parseo. |
| Persistencia | **Archivo JSON** (`backend/src/data/jobs.json`). Sobrevive reinicios, sin dependencias nuevas. |
| Frontend | **Vanilla JS mejorado** (HTML/CSS/JS + CDNs: Chart.js, marked). Fiel a la plantilla, sin build. |
| Chat sobre CVs | **RAG con embeddings reales** de Gemini + similitud coseno. |

API verificada (`@google/genai`):
- Salida estructurada: `responseMimeType: "application/json"` + `responseSchema`.
- Embeddings: `ai.models.embedContent(...)`.
- PDF: `inlineData` con `mimeType: "application/pdf"` (modalidad `DOCUMENT`).

---

## 4. Arquitectura

### 4.1 Estructura de archivos

```
backend/src/
  app.js
  config.js                 # carga el .env y expone puerto y modelos
  middleware/
    rate-limit.js           # límite de peticiones (protege la cuota de IA)
  routes/
    jobs.routes.js          # vacantes + upload + analizar + ranking + chat RAG
    chat.routes.js          # chat "suelto" de la plantilla (se conserva)
  services/
    gemini.service.js       # cliente Gemini (generateContent + embedContent)
    scoring.service.js      # scoring de CVs + ranking/KPIs
    retrieval.service.js    # embeddings + similitud coseno
    chat.service.js         # RAG con historial y citas
    store.service.js        # lectura/escritura data/jobs.json (atómica)
  prompts/
    scoring.prompt.js
    chat.prompt.js
  data/jobs.json            # runtime (gitignored)
  .env.example              # GEMINI_API_KEY, PORT, GEMINI_MODEL

frontend/
  index.html                # SPA con 3 vistas
  css/
    tokens.css  base.css  background.css  blocks.css  views.css
  js/
    api.js                  # capa fetch al backend
    a11y.js                 # utilidades + patrón ARIA de pestañas
    ui.js                   # diálogo de confirmación (<dialog>)
    views/                  # vacantes.js, ranking.js, chat.js
    app.js                  # estado, router de pestañas, tema y toast
  assets/                   # fuentes, iconos, wordmark
```

### 4.2 Endpoints

| Método | Ruta | Función |
|---|---|---|
| POST | `/api/jobs` | Crear vacante |
| GET | `/api/jobs` | Listar vacantes |
| GET | `/api/jobs/:id` | Ver una vacante |
| DELETE | `/api/jobs/:id` | Eliminar vacante (+ PDFs de sus CVs) |
| POST | `/api/jobs/:id/cvs` | Subir CVs (multipart, PDF) |
| DELETE | `/api/jobs/:id/cvs/:cvId` | Eliminar un CV (+ su PDF) |
| GET | `/api/jobs/:id/cvs/:cvId/file` | Servir el PDF de un CV (inline) |
| POST | `/api/jobs/:id/analyze` | Puntuar los CVs pendientes vs vacante (`{ force: true }` re-analiza todo) |
| GET | `/api/jobs/:id/ranking` | Ranking + KPIs |
| POST | `/api/jobs/:id/chat` | Chat RAG sobre los CVs |
| POST | `/api/chat` | Chat suelto (plantilla, sin RAG) |
| GET | `/api/chat/models` | Diagnóstico: listar modelos en consola |


---

## 5. Diseño del prompt (lo que más puntúa)

### 5.1 Prompt de scoring (estructurado)
- **Rol:** reclutador técnico senior.
- **Objetivo:** medir el ajuste del CV contra la vacante.
- **Contexto:** descripción de la vacante + requisitos + contenido del CV.
- **Estilo:** conciso y objetivo.
- **Restricciones:** no discriminar por edad/género/nacionalidad/foto; no inventar experiencia; basarse solo en el CV; marcar "desconocido" si falta información.
- **Estructura:** JSON fijo vía `responseSchema`:

```json
{
  "score": 0,
  "resumen": "",
  "fortalezas": [],
  "gaps": [],
  "skills_match": [],
  "anios_experiencia": 0,
  "recomendacion": ""
}
```

### 5.2 Prompt de chat (RAG)
- **Rol:** asistente de reclutamiento.
- **Contexto:** fragmentos de CVs recuperados por embeddings + vacante.
- **Restricciones:** citar el CV fuente; no inventar; decir "no está en los CVs" si no figura.
- **Estructura:** respuesta breve + fuentes.

---

## 6. Frontend

- **Vacantes:** crear vacante + drag & drop de PDFs.
- **Ranking:** tabla ordenable con score, semáforo, detalle expandible, exportar CSV + dashboard de KPIs (Chart.js).
- **Chat:** streaming tipo ChatGPT, markdown (`marked`), citas de CVs.

---

## 7. Entregables extra

- Documento con los 4 puntos del parcial + sección de **ética/fairness** (human-in-the-loop: la IA ordena, la persona decide).
- Slides + guion de demo (3 casos: match alto, match bajo, pregunta al chat).

---

## 8. Puntos a validar temprano

1. **Nombre del modelo:** `gemini-3.8-flash` parece placeholder. Correr `GET /api/models` y usar uno válido para `generateContent` y otro para embeddings.
2. **PDFs escaneados** (solo imagen): asumir CVs con texto; dejar OCR fuera de alcance.
3. **Falta `.env.example`** y manejo de la API key.

---

## 9. Cronograma sugerido

| Fase | Contenido |
|---|---|
| Fase 1 | Backend base + verificación del modelo |
| Fase 2 | Scoring / ranking |
| Fase 3 | Chat RAG con embeddings |
| Fase 4 | Frontend + documento/slides |
