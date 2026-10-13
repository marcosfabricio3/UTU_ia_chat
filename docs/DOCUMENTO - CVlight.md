# CVlight — Analizador y rankeador de CVs con IA

**Parcial 2 — Proyecto de Inteligencia Artificial**

| | |
|---|---|
| **Tema** | Analizador y rankeador de CVs con chat inteligente sobre los candidatos |
| **Empresa (ficticia)** | Talento Humano S.A. |
| **Materia** | Inteligencia Artificial |
| **Estudiante(s)** | _[Completar nombre(s)]_ |
| **Docente** | _[Completar]_ |
| **Institución** | _[Completar] _ |
| **Fecha** | _[Completar] _ |
| **Modelo LLM** | Google Gemini (`@google/genai`) |

---

## Resumen ejecutivo

**Talento Humano S.A.** recibe cientos de CVs por búsqueda y su equipo de reclutamiento los filtra a mano, con criterios que varían de una persona a otra y a un costo de horas que no escala. **CVlight** es una aplicación web que usa un modelo de lenguaje grande (LLM) de Google Gemini para: (1) **puntuar automáticamente cada CV (0–100)** contra una vacante y generar un **ranking** con fortalezas y brechas; y (2) ofrecer un **chat en lenguaje natural** que responde preguntas sobre el lote de candidatos citando la fuente. La decisión final **sigue siendo humana**: la IA ordena y explica, la persona decide.

---

## 1. Descripción del problema

### 1.1 Contexto
**Talento Humano S.A.** es una consultora de recursos humanos que gestiona procesos de selección para varias empresas. Por cada búsqueda publicada recibe un volumen alto de postulaciones en formato **PDF**, con **formatos, redacciones y niveles de detalle muy heterogéneos**.

### 1.2 Situación actual (el dolor concreto)
1. **Filtrado manual y lento:** un reclutador debe **leer cientos de CVs** para armar una lista corta. Es horas de trabajo repetitivo por cada vacante.
2. **Criterio inconsistente:** dos reclutadores distintos priorizan cosas distintas ante los mismos CVs. No hay una escala objetiva y comparable.
3. **Se pierden buenos candidatos:** muchos CVs válidos quedan sin leer por falta de tiempo.
4. **Comparación costosa:** responder preguntas puntuales ("¿quién tiene React y 3+ años?", "compará los tres primeros") obliga a **releer todo el lote** otra vez.
5. **Sesgo involuntario:** al leer a mano, datos irrelevantes para el puesto (foto, edad, género) pueden influir en la evaluación sin que sea intencional.

### 1.3 Impacto
El proceso es **caro, lento y poco consistente**, y afecta tanto a la empresa (peor servicio, más horas) como a los postulantes (candidatos capaces descartados sin evaluación real).

---

## 2. Propuesta de solución y justificación del uso de IA

### 2.1 Qué se propone: **CVlight**
Una aplicación web donde el reclutador:

1. **Crea una vacante** (título, descripción y requisitos).
2. **Sube los CVs en PDF** (varios a la vez).
3. Ejecuta el **análisis con IA**: el modelo **puntúa cada CV de 0 a 100** según su ajuste a la vacante y extrae datos estructurados (resumen, fortalezas, brechas, habilidades coincidentes, años de experiencia y una recomendación).
4. Consulta el **ranking** automático (ordenado por puntaje, con KPIs del lote).
5. **Chatea** con un asistente que responde preguntas en lenguaje natural sobre los candidatos ("¿quién tiene más experiencia con React?", "¿alguien sabe SQL?") **citando de qué CV sacó cada dato**.

### 2.2 Por qué la Inteligencia Artificial es la herramienta adecuada
El problema tiene tres características que **descartan una solución clásica por reglas o palabras clave**:

- **Texto no estructurado y heterogéneo:** cada CV está redactado distinto. "Desarrollé interfaces con React" y "React.js — 3 años" expresan lo mismo con palabras diferentes. Un buscador por palabras clave falla ante **sinónimos, formatos y redacciones**.
- **Se necesita entender el significado (matching semántico):** el LLM no compara cadenas de texto, **interpreta** el contenido del CV y lo **relaciona semánticamente** con los requisitos de la vacante. Eso es lo que permite puntuar de forma razonada y no por coincidencia literal.
- **Consultas en lenguaje natural:** un LLM permite preguntarle al lote como si fuera una persona ("compará el senior con el junior"), algo **inviable con reglas fijas**.

En resumen: la IA no reemplaza al reclutador, **absorbe el trabajo repetitivo y lo hace consistente y auditable**, liberando tiempo humano para las decisiones que realmente requieren criterio.

### 2.3 Alcance
- **Dentro del alcance:** CVs en PDF con **texto digital** (no escaneados a imagen), evaluación contra un perfil de puesto, chat de consulta sobre el lote.
- **Fuera del alcance (trabajo futuro):** OCR de PDFs escaneados, integración con un ATS real, autenticación de usuarios.

---

## 3. Desarrollo e integración del modelo LLM

### 3.1 Plataforma y modelo elegido
Se utilizó la **API de Google Gemini** mediante el SDK oficial **`@google/genai`** (JavaScript/Node.js). Se eligió por:
- **Soporte de PDF nativo:** permite enviar el PDF **directamente** al modelo, sin librerías de parseo intermedias.
- **Salida estructurada (JSON) garantizada:** mediante esquema (`responseSchema`), lo que hace la respuesta **programable** (se usa directo en el ranking).
- **Embeddings** en el mismo proveedor, lo que simplifica el RAG.
- **Costo/latencia** adecuados y disponibilidad de una capa gratuita para el desarrollo.

Modelos configurados (en `backend/src/config.js`, ajustables por `.env`):

| Uso | Variable | Cadena por defecto | Detalle |
|---|---|---|---|
| Scoring (batch) | `GEMINI_SCORING_MODELS` | `gemini-3.8-flash` → `3.5-flash` → `3.5-flash-lite` | Texto + lectura de PDF |
| Chat (interactivo) | `GEMINI_CHAT_MODELS` | `GEMINI_CHAT_MODEL` + respaldos | Razonamiento `low` |
| Autocompletar | `GEMINI_SUGGEST_MODELS` | `GEMINI_SUGGEST_MODEL` + respaldos | El más liviano/rápido |
| Embeddings (RAG) | `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | Vectores de **768** dimensiones (`outputDimensionality`) |

Cada tarea define una **cadena** de modelos (en orden de preferencia): si el primero está
**saturado (503)**, con la **cuota diaria agotada (429)** o fue **retirado (404)**, se pasa al
siguiente **sin cortar la consulta** (`401/403/400` son fatales). Un modelo que falla se
**enfría** (pasa al final de la cadena) por un rato; en streaming, si el corte ocurre a mitad de
la respuesta, el frontend vacía la burbuja y avisa. Detalle en `docs/PENDIENTES - CVlight.md` §2.11.

> **Latencia.** Las tareas interactivas (Autocompletar y chat) usan un modelo más liviano y
> `thinkingConfig.thinkingLevel: "low"`; el scoring prioriza calidad (`high`). Los pedidos
> tienen **timeout** por intento y **reintentos** acotados, y el chat responde por **streaming (SSE)**.
> El detalle está en `docs/PENDIENTES - CVlight.md` §2.10.

### 3.2 Integración 1 — Lectura de PDF directo
El CV **no se convierte a texto con una librería**: se envía el archivo a Gemini como **datos en línea** (`inlineData` con `mimeType: application/pdf`). El modelo lo lee e interpreta directamente. Esto reduce dependencias y errores de extracción.

```js
// backend/src/services/gemini.service.js (extracto)
const data = fs.readFileSync(f.path).toString("base64");
contents.push({ inlineData: { data, mimeType: f.mimeType } }); // application/pdf
```

### 3.3 Integración 2 — Salida estructurada (JSON)
Para el scoring se le pide al modelo un **JSON con forma fija** mediante `responseMimeType: "application/json"` + `responseSchema`. Así la respuesta se consume de forma confiable (sin parsear texto libre):

```js
if (responseSchema) {
  config.responseMimeType = "application/json";
  config.responseSchema = responseSchema;
}
```

### 3.4 Integración 3 — RAG (retrieval-augmented generation)
Para el chat, no se envían todos los CVs siempre. Se hace **recuperación semántica**:
1. Cada CV, al analizarse, se convierte en un **vector** (embedding) que se guarda junto al candidato.
2. La pregunta del usuario también se convierte en vector.
3. Se calcula la **similitud coseno** entre la pregunta y cada CV, y se envían al modelo los **más relevantes** como contexto.
4. El modelo responde **usando solo ese contexto** y **citando la fuente**.

> Esto es lo que hace que el asistente no invente: solo "ve" los CVs que se le pasan y tiene instrucción explícita de no salir de ahí.

### 3.5 Arquitectura del software

```
backend/src/
  app.js                    # servidor Express, CORS, manejo de errores
  config.js                 # variables de entorno y modelos
  routes/
    jobs.routes.js          # vacantes + upload de CVs + analizar + ranking + chat
    chat.routes.js          # chat "suelto" de la plantilla original (se conserva)
  services/
    gemini.service.js       # cliente Gemini: generateContent + embedContent
    scoring.service.js      # scoring de CVs y armado del ranking/KPIs
    retrieval.service.js    # embeddings + similitud coseno
    chat.service.js         # RAG: recuperar + armar contexto + responder
    store.service.js        # persistencia en JSON
  prompts/
    scoring.prompt.js       # system prompt + esquema JSON del scoring
    chat.prompt.js          # system prompt del chat
  data/jobs.json            # datos (vacantes, CVs, scores, vectores)
```

**Endpoints principales:**

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/jobs` | Crear una vacante |
| `POST` | `/api/jobs/suggest` | Autocompletar la vacante con IA (requisitos + descripción) desde el título |
| `GET` | `/api/jobs` | Listar vacantes |
| `GET` | `/api/jobs/:id` | Ver una vacante |
| `POST` | `/api/jobs/:id/cvs` | Subir CVs (multipart, solo PDF) |
| `POST` | `/api/jobs/:id/analyze` | Puntuar los CVs pendientes vs. la vacante (`{ force: true }` re-analiza todo) |
| `GET` | `/api/jobs/:id/ranking` | Ranking ordenado + KPIs |
| `POST` | `/api/jobs/:id/chat` | Chat RAG sobre los CVs |

### 3.6 Persistencia
Los datos se guardan en un archivo **JSON** (`backend/src/data/jobs.json`): vacantes, CVs, resultados del análisis, vectores y rutas a los PDFs. Sobrevive reinicios del servidor y **no requiere instalar una base de datos** para la escala del proyecto.

---

## 4. Configuración del sistema y diseño del prompt

El modelado del comportamiento del LLM es la parte central del proyecto. Se definieron **dos prompts de sistema** (`systemInstruction`), uno para cada tarea, cubriendo los seis aspectos pedidos: **rol, objetivo, contexto, estilo, restricciones y estructura**.

### 4.1 Prompt de SCORING (evaluación estructurada)

> **Rol:** reclutador técnico senior con más de 10 años de experiencia evaluando candidatos.
> **Objetivo:** medir qué tan bien encaja un CV con una vacante concreta y devolver una puntuación objetiva y justificada que ayude a priorizar.
> **Contexto:** descripción y requisitos de la vacante + el CV en PDF. Debe basarse **únicamente** en esa información.
> **Estilo:** objetivo, profesional y conciso; español, tercera persona; sin adornos ni opiniones subjetivas.
> **Restricciones (obligatorias):**
> - **No** usar ni mencionar edad, género, nacionalidad, estado civil, religión, foto ni datos personales no relacionados con el puesto.
> - **No** inventar experiencia, títulos ni habilidades que no figuren en el CV.
> - Si falta información relevante, indicar "no especificado" en lugar de suponer.
> - El score va de **0 a 100** según el ajuste a los requisitos.
> - **La decisión final siempre es humana**: es una herramienta de apoyo, no rechaza ni contrata.
> **Estructura:** devolver **únicamente un JSON** con el formato solicitado.

**Estructura esperada (esquema JSON forzado):**

```json
{
  "score": 0,
  "resumen": "Resumen breve del perfil (2-3 frases)",
  "fortalezas": ["..."],
  "gaps": ["..."],
  "skills_match": ["..."],
  "anios_experiencia": 0,
  "recomendacion": "...",
  "texto_extraido": "Texto plano completo del CV"
}
```

El campo `texto_extraido` cumple una doble función: además de documentar el contenido leído, es el texto que luego se convierte en **embedding** para el chat RAG.

### 4.2 Prompt de CHAT (RAG)

> **Rol:** asistente de reclutamiento que ayuda a un reclutador a consultar y comparar los candidatos de una vacante.
> **Objetivo:** responder preguntas sobre los CVs **usando solo la información provista**.
> **Contexto:** descripción de la vacante; los candidatos recuperados (archivo, score, resumen, habilidades y texto del CV); y, opcionalmente, el historial de la conversación.
> **Estilo:** claro, breve y profesional; responder en español.
> **Restricciones (obligatorias):**
> - Responder **únicamente** con información de los CVs provistos.
> - **Citar siempre** de qué candidato (por su archivo) sale cada dato.
> - Si la respuesta **no está** en los CVs, decirlo explícitamente ("no figura en los CVs").
> - **No inventar** datos ni usar datos personales sensibles (edad, género, etc.).
> - **La decisión final es humana**: es una ayuda, no decide contrataciones.
> **Estructura:** una respuesta directa y, al final, una línea "Fuentes:" con los archivos citados.

### 4.3 Parámetros de configuración
- **Temperatura baja** (comportamiento conservador): se prioriza la **fidelidad a los datos** por sobre la creatividad — clave para no inventar.
- **Salida JSON** forzada solo en el scoring (donde se necesita estructura); en el chat, **texto libre** (porque se espera una explicación en lenguaje natural).
- **Top-K de recuperación = 5:** se envían los 5 CVs más similares a la pregunta.

### 4.4 Ética y fairness (human-in-the-loop)
Este es un punto transversal del diseño, **explícito en ambos prompts**:
- **Anti-discriminación:** el prompt prohíbe taxativamente considerar edad, género, nacionalidad, estado civil, religión o foto.
- **Sin invención:** se prohíbe inventar datos; el sistema debe admitir cuando algo no figura.
- **Trazabilidad:** el chat cita siempre la fuente (archivo del CV), y el scoring guarda el texto extraído. Toda decisión es **auditable**.
- **Human-in-the-loop:** la IA **ordena, resume y explica**; la **decisión de contratar o descartar es de una persona**. El sistema se presenta como una ayuda a la decisión, nunca como el decisor.

---

## 5. Exposición del proyecto (guion de 5–10 min)

### 5.1 Estructura sugerida
| Min | Contenido |
|---|---|
| 0:00–1:00 | **Problema:** Talento Humano S.A. y el filtrado manual de CVs. |
| 1:00–2:30 | **Solución:** qué es CVlight y por qué la IA es la herramienta correcta (matching semántico vs. palabras clave). |
| 2:30–4:00 | **Uso de IA + LLM:** Gemini, PDF directo, salida JSON, embeddings/RAG. |
| 4:00–6:00 | **Diseño del prompt:** recorrer las 6 partes y destacar las restricciones éticas. |
| 6:00–9:00 | **DEMO en vivo.** |
| 9:00–10:00 | **Cierre:** limitaciones y trabajo futuro. |

### 5.2 Guion de la demo (con los CVs de ejemplo)
1. **Crear la vacante** "Desarrollador Frontend" (requisitos: 2+ años React, Git, inglés técnico).
2. **Subir 5 CVs** de ejemplo y ejecutar **Analizar**.
3. Mostrar el **ranking**: Ana Pérez (98) y Diego Ruiz (95) arriba; Beto Gómez (40); Carla Díaz (35); Elena Sosa (10) abajo. Señalar que el score está **justificado** con fortalezas y brechas.
4. **Caso 1 — coincidencia alta:** abrir el detalle de Ana y mostrar por qué puntúa alto.
5. **Caso 2 — brecha:** mostrar por qué Elena (diseñadora UX) puntúa bajo para un puesto de desarrollo.
6. **Caso 3 — chat:**
   - Pregunta **en dominio:** *"¿Quién tiene más experiencia con React y cuántos años?"* → responde citando `ana_perez.pdf` y comparando.
   - Pregunta **fuera de dominio:** *"¿Algún candidato tiene experiencia en Java o Python?"* → responde **"no figura en los CVs"** (demuestra que **no alucina**).
   - Mostrar la línea **"Fuentes:"** (trazabilidad).

### 5.3 Posibles preguntas y respuestas
- **"¿Y si el CV está escaneado (imagen)?"** → Fuera de alcance; requeriría OCR. El sistema asume PDF con texto.
- **"¿No es riesgoso que la IA decida?"** → No decide: **ordena y explica**; la decisión es humana (human-in-the-loop), y hay reglas anti-sesgo y trazabilidad.
- **"¿Por qué no una base de datos / buscador por palabras clave?"** → Porque el texto es heterogéneo y el problema es de **significado**, no de coincidencia literal.

---

## 6. Resultados y pruebas

### 6.1 Ranking de ejemplo (5 CVs sintéticos vs. vacante "Desarrollador Frontend")

| # | Candidato | Score | Años (React) | Lectura |
|---|---|---|---|---|
| 1 | `ana_perez.pdf` | **98** | 5 | Senior React: cubre y excede todos los requisitos |
| 2 | `diego_ruiz.pdf` | **95** | 3 | Full-stack con 2 años de React e inglés C1 |
| 3 | `beto_gomez.pdf` | **40** | 1 | Backend sólido, pero 1 año de React y sin inglés |
| 4 | `carla_diaz.pdf` | **35** | 1 | Junior, sin Git ni inglés técnico |
| 5 | `elena_sosa.pdf` | **10** | 0 | Diseñadora UX/UI, sin experiencia en desarrollo |

- **Promedio del lote:** 55.6
- **Habilidades más frecuentes:** React (3), Git (3), Inglés técnico (2)

El ranking **distingue claramente** perfiles fuertes de débiles, y cada puntaje viene acompañado de su justificación.

### 6.2 Pruebas funcionales del chat (RAG)
| Prueba | Resultado |
|---|---|
| Pregunta en dominio ("¿quién tiene más React y cuántos años?") | ✅ Identifica a Ana y compara con el resto, citando archivos |
| Pregunta fuera de dominio ("¿Java o Python?") | ✅ Responde "no figura en los CVs" — **no alucina** |
| Comportamiento ético (intento de averiguar edad) | ✅ Se niega a usar datos sensibles |
| Multi-turno (con historial) | ✅ Usa el contexto previo de la conversación |

---

## 7. Limitaciones y trabajo futuro
- **OCR:** hoy solo procesa PDFs con texto digital.
- **Escala:** la recuperación por similitud coseno es suficiente para decenas/cientos de CVs; a mayor escala convendría una **base vectorial** (pgvector, FAISS) y una base de datos transaccional.
- **Evaluación del propio modelo:** se podría medir la calidad del scoring contra un conjunto de CVs con puntajes esperados (validación humana).
- **Multiusuario:** falta autenticación y separación de datos por reclutador.

---

## 8. Anexos

### 8.1 Cómo ejecutar el proyecto
```powershell
# 1) Backend
cd backend
npm install
# Crear .env con: GEMINI_API_KEY=... (ver .env.example)
npx nodemon src/app.js          # servidor en http://localhost:3000

# 2) CVs de ejemplo (opcional)
python scripts/generar_cvs.py    # genera 5 PDFs en sample-cvs/
```

### 8.2 Definición de la empresa ficticia
**Talento Humano S.A.** — consultora de RRHH que gestiona procesos de selección para empresas de tecnología. Su problema: **volumen alto de CVs y filtrado manual inconsistente**.

---

> **Nota final:** CVlight demuestra que un LLM puede integrarse de forma **útil, trazable y ética** en un proceso real de selección, siempre con la persona en el centro de la decisión.
