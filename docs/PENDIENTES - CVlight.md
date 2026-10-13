# PENDIENTES — CVlight

**Actualizado:** martes 13/10/2026
**Contexto:** latencia de la IA (modelo liviano para Autocompletar, nivel de razonamiento
"low" en las tareas interactivas, reintentos/timeout y streaming del chat).

---

## 1. Estado de la IA (cuota / saturación) — al 13/10

La **cuota diaria** (429) se resetea. Lo que sigue es **saturación transitoria** (503) del
modelo principal `gemini-3.8-flash`: la API responde
*"This model is currently experiencing high demand…"*. Medición del **13/10**:

| Modelo | Estado | Latencia típica |
|---|---|---|
| `gemini-3.8-flash` (principal) | **503** intermitente | — (falla) |
| `gemini-3.5-flash` | OK | ~3 s |
| `gemini-3.5-flash-lite` (Autocompletar) | OK | ~16–30 s |
| `gemini-embedding-001` | OK (cuota aparte) | ~0,4 s |

> Si `gemini-3.8-flash` sigue saturado para la demo: `GEMINI_MODEL=gemini-3.5-flash` en
> `backend/.env` (afecta chat y scoring). Es una variable de entorno, no hace falta tocar código.

### 1.1 Checklist a completar cuando el modelo principal responda

- [ ] **Análisis real con éxito (E2E).**
  - Sobre la vacante ya cargada (o una nueva), subir los 5 PDFs de `sample-cvs/` y
    pulsar **"Analizar CVs"**.
  - Esperado: estado **"Listo. Se analizaron 5 CVs. Ranking actualizado."** + toast
    "CVs analizados.".
  - Consume ~5 requests.

- [ ] **Análisis incremental (no re-gasta cuota).**
  - Con la vacante ya analizada, subir **1 CV nuevo** y pulsar **"Analizar CVs (1)"**.
  - Esperado: se analiza **solo el nuevo** (los demás se saltan) → *"Listo. Se
    analizaron 1 CV. Ranking actualizado."*; el botón pasa a **"Re-analizar todos"**.
  - Consume 1 request (antes re-analizaba todos: N requests).

- [ ] **Tolerancia a fallos parcial (1 OK + 1 fallido).**
  - Crear una vacante de prueba y subir **1 PDF real** (`sample-cvs/ana_perez.pdf`) +
    **1 "PDF" corrupto** (texto plano con extensión `.pdf`).
  - Esperado: *"Se analizaron 1 CV. Quedan 1 sin analizar: corrupto.pdf. <motivo> Volvé a
    intentar para completar."* y el botón "Analizar" habilitado de nuevo.
  - Consume ~2 requests. **Ya validado con un stub** (ver sección 3), falta el caso real.

- [ ] **Chat RAG con respuesta real del modelo.**
  - Sobre la vacante analizada, preguntar p. ej. *"¿Quién tiene más experiencia con React?"*.
  - Esperado: Markdown renderizado (**negrita**, **viñetas**, listas numeradas) con
    **nombres resaltados** y los chips de **fuentes** con su similitud.
  - Consume 1–2 requests. **Ya validado con un stub** (ver sección 3), falta el caso real.

### 1.2 Cómo probar sin gastar de más

- La cuota es **por modelo** y **por día** (20 req/modelo). Los flash de esta cuenta
  comparten/aliasan cupo (`3.5 → 3.6`).
- Preferir **una sola** llamada de diagnóstico antes de re-testear.
- Si se quiere forzar otro bucket, usar override por variable de entorno **sin tocar `.env`**:

```powershell
# dentro de backend/
$env:GEMINI_MODEL="gemini-3.5-flash"; node src/app.js
# ... probar ...
# al terminar: cerrar ese proceso y volver a levantar con la config original
```

---

## 2. Identidad de marca y pendientes funcionales

### 2.1 Identidad de marca — HECHO

- **Wordmark SVG + favicon** implementados.
  - `frontend/assets/wordmark.svg` — "CVlight" en Archivo Black convertido a **paths**
    (vectorial: no depende de la fuente). Se usa en el navbar como `<img class="wordmark">`.
  - `frontend/assets/logo.svg` — lockup (símbolo + wordmark).
  - `frontend/assets/favicon.svg` — símbolo de dos recuadros desfasados (hojas de CV).
  - `frontend/assets/favicon.ico` (16/32/48), `apple-touch-icon.png` (180),
    `icon-192.png`, `icon-512.png`.
  - `frontend/site.webmanifest` + links en el `<head>` de `frontend/index.html`.
- El antiguo `span.lamp` (cuadradito provisional) se reemplazó por el **símbolo de marca**
  inline (`svg.brand-mark`, monocromo en `currentColor`) a la izquierda de "CVlight".
- El **footer** sigue con el wordmark de texto (decisión del usuario; visualmente idéntico
  porque usa la misma Archivo Black).

### 2.2 Pendiente funcional (no depende de la cuota)

- **Actualizar el documento del parcial** (`docs/DOCUMENTO - CVlight.md`) con los arreglos
  de esta iteración: skip-link/foco, render de Markdown, validación de PDF en cliente,
  guard de doble envío, tolerancia a fallos por CV, mensajes de error accionables y la
  nueva identidad de marca.

- **(Opcional / diferido — Fase 3 del refactor):**
  - Renombrar `.block--frost` (nombre heredado del diseño viejo).
  - Recortar la escala de `h1`.
  - ~~Actualizar el árbol de archivos desactualizado en `docs/PLAN - Proyecto CVlight.md`.~~ **HECHO** (auditoría de calidad, §5).

### 2.3 Borrado de vacantes — HECHO

- **Borrar sólo la vacante elegida.** La identidad viaja en `data-job` (el `id` real),
  **nunca por índice**: no puede alcanzar a otra aunque cambie el orden o el estado.
- **Backend:** `DELETE /api/jobs/:id` (`backend/src/routes/jobs.routes.js`) →
  `store.deleteJob(id)` (`store.service.js`). Borra el registro (fuente de verdad) y
  después los PDFs de sus CVs, *best-effort*: si falla el `unlink` la vacante igual
  desaparece (queda un PDF huérfano, inofensivo) — nunca al revés.
- **Bug corregido — el basurero desplegaba la tarjeta.** El `.j-trash` era un `<span>`
  **dentro** de `<button class="job-head">`: HTML inválido (sin foco ni teclado) y el
  listener evaluaba `.job-head` primero. Ahora la fila es un `<div class="job-head">` y
  el toggle es un `<button class="job-toggle">` con el patrón **"botón estirado"**
  (`::after` que cubre la fila): el basurero es un `<button>` **hermano**, accesible y
  que no puede disparar el `aria-expanded`. El anillo de foco abraza la fila
  (`.job-head:has(.job-toggle:focus-visible)`).
- **Confirmación:** `frontend/js/ui.js` → `CV.ui.confirm({ title, message, confirmLabel })`
  (`Promise<boolean>`), sobre `<dialog>` nativo + `showModal()`: foco atrapado, Esc y
  `::backdrop` gratis. El foco arranca en **Cancelar** (la acción es irreversible).
  Botón de peligro `.btn.danger` con `--danger` + `--card`, que rotan con el tema.
- **Detalles de robustez:** `deleting` (Set) evita el doble envío y deshabilita el
  basurero mientras viaja la petición; al borrar se limpian `expandedId`, `activeJobId` y
  `status[id]`; el foco pasa al toggle vecino (o a `#f-titulo` si no quedan vacantes);
  un **404** se trata como "ya no existía" (refresca y avisa, no lo reporta como error).
- **Bug latente corregido:** borrar una vacante **mientras corría un análisis** hacía
  `updated.cvs` sobre `null` → **TypeError (500)**. El route ahora chequea `if (!updated)`
  y responde 404.
- **Centrado del diálogo.** El reset global de la hoja (`* { margin: 0 }`) pisa el
  `margin: auto` con el que el navegador centra el `<dialog>`: sin reponerlo quedaba
  pegado arriba a la izquierda. `.confirm` ahora fija `margin: auto` explícito.
- **`returnValue` no se filtra entre aperturas.** Esc lo limpia, pero `close()` sin
  argumentos **no** (conserva el `"ok"` anterior), así que un cierre sin valor podía
  leerse como confirmación. `CV.ui.confirm` ahora limpia `dialog.returnValue = ""`
  antes de cada `showModal()`.

### 2.4 Borrado de un CV individual (ícono "shredder") — HECHO

- **Qué hace.** Cada chip de CV de una vacante lleva al final un ícono **shredder**
  (Lucide; `frontend/js/views/vacantes.js` → `cvChips`) que borra **ese** CV del sistema:
  sale del registro de la vacante (ranking y chat/RAG) y se borra su PDF. Para recuperarlo
  hay que **subirlo de nuevo**. No toca ni la vacante ni los demás CVs.
- **Backend:** `DELETE /api/jobs/:id/cvs/:cvId` → `store.deleteCv(jobId, cvId)`
  (`store.service.js`). Mismo criterio que al borrar la vacante: primero el registro
  (fuente de verdad) y después el PDF, *best-effort*. `404` si no existe la vacante o el CV.
- **Sale del RAG sin invalidar nada:** no hay índice cacheado. `POST /:id/chat` relee la
  vacante en cada request y tanto el guard `hayAnalizados` (`c.vector`) como
  `retrieveRelevantCvs` filtran sobre `job.cvs`: al quitar el CV del registro deja de poder
  recuperarse. El ranking usa el mismo criterio (`typeof c.score === "number"`).
- **Frontend:** el botón es un `<button class="chip-x" data-action="shred" data-job data-cv>`
  con `aria-label="Eliminar el CV «archivo»"`. La identidad viaja en `data-job` + `data-cv`
  (ids reales), igual que en el resto de la vista. Reusa `CV.ui.confirm` y un Set
  `shredding` (deshabilita el chip mientras viaja la petición y evita el doble envío).
- **Detalle de tema:** `.chip-x` usa `color: var(--ink-2)`, **no** `inherit`. En oscuro
  `--ink` es salmón (`#FF7A6B`), así que heredar el color del chip volvía el hover
  invisible (`--ink-2` reproduce el basurero al pie de la letra en ambos temas).
- **El ranking no se toca:** sus chips de skills comparten `.chip` pero **no** `.chip-x`,
  así que nunca muestran el shredder.

### 2.5 Abrir el PDF de un candidato desde el ranking — HECHO

- **Qué hace.** Cada placa (dossier) del ranking lleva, al lado del nombre, un ícono
  **square-arrow-out-up-right** (Lucide) que abre el PDF de **ese** candidato en una pestaña
  nueva. Mismo hover salmón que el basurero y el shredder, en ambos temas.
- **Backend:** `GET /api/jobs/:id/cvs/:cvId/file` sirve el PDF con `Content-Type:
  application/pdf` y `Content-Disposition: inline` (lo muestra el visor del navegador, no lo
  descarga). `404` si no existe la vacante o el CV, y también si el `path` del registro no cae
  adentro de la carpeta de CVs (nunca se expone una ruta arbitraria).
- **Frontend:** `<a class="d-open" ... target="_blank" rel="noopener">` con
  `aria-label="Abrir el CV «archivo» en una pestaña nueva"`; la URL la arma
  `CV.api.cvFileUrl(jobId, cvId)` (respeta el `API_BASE`).
- **HTML válido (patrón "botón estirado").** El encabezado de la placa dejó de ser un
  `<button>` y ahora es un `<div class="d-head">` con un `<button class="d-toggle">` (sólo el
  chevron) estirado con `::after` sobre toda la fila —igual que `.job-head`— y el `<a>` es un
  hermano. Así el click del ícono **no** puede disparar el `aria-expanded` del toggle (nada de
  interactivos anidados). `.d-open` va con `z-index: 1` para quedar por encima del `::after`.
- **Nunca queda huérfano:** entre el nombre y el `<a>` **no** hay espacio en blanco (el hueco
  lo da `margin-left: var(--s2)`). Ese espacio era un punto de corte y, con nombres que apenas
  entraban (p. ej. "Beto Gomez"), mandaba el ícono solo a la segunda línea.

### 2.6 Análisis incremental (no re-gasta cuota) — HECHO

- **Problema.** `analyzeJob` re-analizaba **todos** los CVs en cada click: subir 1 CV nuevo y
  pulsar "Analizar" volvía a llamar a la IA por los ya analizados. Cuando la IA falla (visto:
  **503 "servicio saturado"**), esa corrida fallaba **para todos** (incluido el que ya estaba OK)
  y el mensaje mentía: *"Analizados 0 de 2"* aunque la vacante siguiera con 1 analizado (el
  frontend calculaba `total - failed`).
- **Skip.** `analyzeJob(jobId, { concurrency, force })` procesa solo los **pendientes**
  (`typeof c.score !== "number"`). Un CV que falla **no** se marca (queda sin score), así que el
  siguiente intento lo **reintenta solo**. `force: true` re-analiza todo.
- **Reintento automático.** `gemini.service` reintenta los errores **transitorios** (503 saturado,
  429 límite por minuto, 500, 504) hasta 3 veces con espera creciente (1s, 2s). No reintenta
  401/403 (credencial) ni errores de formato. Reduce muchísimo el "satisface y falla" que veía el
  usuario.
- **API.** `POST /api/jobs/:id/analyze` acepta `{ force: true }`, y responde
  `{ analyzedNow, skipped, pending, failed: [{ archivo, message }] }`. Si no había nada pendiente
  devuelve **200** con `message: "Todos los CVs ya estaban analizados."` (no es error); solo
  responde **502** si había algo que analizar y **nada** salió bien.
- **UI.** El botón muestra cuántos faltan — *"Analizar CVs (N)"* — y cuando ya está todo pasa a
  *"Re-analizar todos"* (manda `force`). El badge distingue **Analizada / Parcial / Sin analizar**,
  y el mensaje de fallo usa el estado real (`analyzedNow`, `pending`) y el **motivo** que manda el
  backend, no `total - failed`.
- **Verificado:** (1) con un arnés que reemplaza la IA por un stub (`%TEMP%\opencode\test-analizar.js`):
  salta los ya analizados, reintenta solo el fallido, y `force` re-analiza los 3; (2) **E2E real**:
  vacante con matias analizado + camila pendiente → "Analizar" procesó **solo camila**
  (`analyzedNow: 1, skipped: 1`) y quedó el ranking con ambos (95 y 25).

### 2.7 Botón "Autocompletar" con IA (reemplaza "Cargar ejemplo")
- **Qué cambia.** El botón "Cargar ejemplo" (artefacto de desarrollo: rellenaba el formulario con
  una constante `SAMPLE`) se reemplazó por **"Autocompletar"**, que usa la IA para **redactar** la
  vacante a partir del título.
- **Backend.** `POST /api/jobs/suggest` (en `jobs.routes.js`, con `aiLimit`): recibe
  `{ titulo, requisitos? }`. Sin título → `400`. **Sin requisitos** genera **requisitos +
  descripción**; **con requisitos** los respeta y solo redacta la descripción. Responde
  `{ success, requisitos, descripcion }`. Es **puro texto**: no crea ni guarda nada.
- **Prompt.** `backend/src/prompts/suggest.prompt.js` (`SUGGEST_SYSTEM_INSTRUCTION` +
  `SUGGEST_SCHEMA`), mismo patrón de **salida estructurada (JSON)** que el de scoring.
- **Frontend.** En `views/vacantes.js`: se borró `SAMPLE` y el listener de `#load-sample`; el botón
  `#suggest-btn` es **texto + ícono Lucide a la derecha**. Al hover/focus se tiñe TODO el botón
  (palabra **e** ícono) con el **acento** (`--salmon`: salmón en claro, blanco en oscuro) y el ícono
  hace cross-fade `sparkle` → `sparkles`. (Teñir sólo el ícono no se notaba en oscuro, donde la
  tinta base ya es salmón.) `suggest()` valida el título, muestra el estado en `#st-form`, **solo
  completa campos vacíos** y, si iba a pisar texto existente, **pide confirmación**
  (`CV.ui.confirm`). Los íconos se agregaron al set curado (`a11y.js`) y la animación vive en
  `css/views.css` (respeta `prefers-reduced-motion`). Los requisitos se normalizan a **viñetas**
  (`asBullets`: una por línea, con `• ` al frente).
- **Costo.** 1 petición a la IA por click; reusa el reintento ante 503/429 y el rate-limit (30/min).
- **Verificado.**
  - **Stub, sin cuota** (`%TEMP%\opencode\test-suggest.js`, stubbea `gemini.service`): sin título →
    `400`; solo título → `200` con requisitos + descripción; con requisitos → el prompt los incluye;
    se pasan `systemInstruction` y `responseSchema`.
  - **Ruta en vivo:** título vacío → `400` "Indicá un título.".
  - **E2E real (1 llamada):** "Desarrollador Frontend React" → `200` con requisitos y descripción
    coherentes (~93 s).
  - **Navegador (API stubbeada):** el botón renderiza **texto + 2 SVG a la derecha**; hover → el
    ACENTO tiñe texto e ícono (claro: salmón `rgb(255,122,107)`; oscuro: blanco `rgb(255,255,255)`)
    con `sparkle`(0)/`sparkles`(1) y sin hover al revés; rellena vacíos; con texto pide confirmación
    "Reemplazar la descripción" (aceptar reemplaza; cancelar deja intacto y avisa "No se cambió
    nada."); sin título → error de campo y **no** llama a la IA; si la IA falla → estado de error y
    campos intactos; requisitos en viñetas. Consola limpia. **Ok.**

### 2.8 Anillo de foco del selector de tema (shadow DOM)
- **Síntoma.** Al hacer click en el `<theme-switch>` de la navbar aparecía un **borde negro** (2px)
  que quedaba hasta sacar el foco.
- **Causa.** La regla `.theme-switch:focus-within` dibujaba el anillo también con el **mouse**: el
  botón real vive dentro del **shadow DOM** del componente, así que un click lo enfoca y
  `:focus-within` matchea (aunque el foco no sea "visible").
- **Arreglo.** `:focus-visible` **no** se puede consultar desde afuera del shadow root ni con
  `:has()`. Se registra la **modalidad de entrada** en `html.kb` (`a11y.js`: `keydown` la activa,
  `pointerdown` la quita) y la regla pasa a `html.kb .theme-switch:focus-within`. Con teclado el
  anillo vuelve a verse (además del que ya dibuja el navegador); con mouse, no.
- **Verificado (navegador, computed styles).** Click → `focus-within: true` pero `outline: none`.
  `keydown` + foco visible → `html.kb` + `outline: 2px solid rgb(11,11,11)`. `pointerdown` → sin
  anillo. **Ok.**

### 2.9 Botón "Enviar" del chat como ícono (`send-horizontal`)
- **Cambio.** El botón de enviar del chat pasa de texto (`Enviar`) al ícono Lucide
  **`send-horizontal`** (agregado al set curado de `a11y.js`), con `aria-label="Enviar"` (el SVG va
  `aria-hidden`).
- **Proporción.** Para que **no** quede cuadrado, `.chat-send` (`css/views.css`) usa
  `min-width: 5.8rem` (≈ el ancho del botón de texto) + `align-self: stretch` (el alto sigue al del
  input) y centra el ícono con `inline-flex`.
- **Verificado (navegador).** Botón 93×54 px (relación ~1.7:1, rectangular), 1 SVG `icon-send-horizontal`
  de 20 px, `aria-label="Enviar"`, alto igual al input y consola limpia. **Ok.**

### 2.10 Latencia de la IA (menos espera en Autocompletar, chat y análisis)
- **Síntoma.** "Autocompletar" tardaba ~93 s y el chat/análisis también se sentían lentos.
- **Causa principal.** Todos los pedidos iban al mismo modelo (`gemini-3.8-flash`) **sin**
  controlar el razonamiento ("thinking"): la IA "pensaba" de más antes de responder. A esto se
  sumaban: reintentos de 3 intentos incluso en las acciones interactivas, sin **timeout** de
  red, y el chat esperando la respuesta completa (sin streaming).
- **Causa de fondo (entorno).** El modelo `gemini-3.8-flash` del free tier está **saturado**
  (503) de forma intermitente; por eso algunas mediciones eran peores.
- **Cambios.**
  - **Modelo por tarea** (`config.js`): `GEMINI_SUGGEST_MODEL` (Autocompletar, se usa
    `gemini-3.5-flash-lite`), `GEMINI_CHAT_MODEL` (chat) y `GEMINI_MODEL` (scoring, el
    principal). Todos con default = `GEMINI_MODEL`.
  - **Nivel de razonamiento** (`thinkingConfig.thinkingLevel`, Gemini 3): `low` para
    Autocompletar y chat, `high` para el scoring. Configurable por
    `GEMINI_THINKING_LEVEL_{SUGGEST,CHAT,SCORING}` (vacío = default del modelo).
    *(Nota: en Gemini 3 el ajuste correcto es `thinkingLevel`; `thinkingBudget: 0` —lo que
    sugería la versión vieja de la doc— devuelve `400 INVALID_ARGUMENT` en estos modelos.)*
  - **Reintentos y timeout** (`gemini.service.js`): `withRetry` con `attempts` por tarea
    (`GEMINI_RETRIES_INTERACTIVE=2` en Autocompletar/chat, `GEMINI_RETRIES_BATCH=3` en
    scoring) y **timeout por intento** (`AI_REQUEST_TIMEOUT_MS`, default 120 s) a nivel de
    cliente. En el frontend, `api.js` corta cada `fetch` con `AbortController` (120 s; 10 min
    en el análisis) y traduce el corte a un mensaje claro.
  - **Streaming en el chat** (SSE): `POST /api/jobs/:id/chat/stream` manda `sources` → muchos
    `delta` → `done` (o `error`). `chat.service.prepare()` hace la recuperación (embedding)
    **antes** de abrir el stream. El frontend (`chat.js`) escribe la respuesta a medida que
    llega, con cursor parpadeante y **`aria-busy`** para no anunciar cada fragmento al lector
    de pantalla. El endpoint **no** se cambió: `/chat` sigue existiendo como fallback.
  - **Logs de latencia** (`gemini.service.js`): cada llamada registra
    `[ai:<tarea>] ok en <ms> pensados=<n> entrada=<n> salida=<n>` (usa `usageMetadata`); los
    reintentos y errores quedan en consola. No cuestan cuota → medir siempre con esto.
- **Verificado.**
  - **Sin cuota:** sintaxis (`node --check`) de backend y frontend; SSE OK de punta a punta
    (evento `sources` a los ~450 ms y `error` cuando el modelo estaba en 503).
  - **Real:** `/suggest` → **200 en ~30 s** (antes ~93 s) con `gemini-3.5-flash-lite` +
    `thinkingLevel: low`. Sondeo de modelos: `gemini-3.5-flash` respondió en **~3 s**,
    `gemini-3.8-flash` devolvía **503** en ese momento.
- **Pendiente / a decidir.** Si el modelo principal (`gemini-3.8-flash`) sigue saturado, poner
  en `.env` `GEMINI_MODEL=gemini-3.5-flash` (afecta al chat y al scoring) para la demo.

---

## 3. Ya verificado (para contraste — NO volver a gastar cuota en esto)

| # | Ítem | Cómo se verificó | Resultado |
|---|---|---|---|
| 1 | Skip-link mueve foco a `#view` sin ensuciar el hash | navegador real | ✅ foco en `MAIN#view`, hash `#vacantes` intacto |
| 2 | Render Markdown (`CV.util.richText`) | unit, 9 casos | ✅ negrita, cursiva, código, `ul`, `ol`, párrafos, XSS escapado |
| 3 | Markdown en burbuja real del chat | **stub** de `CV.api.chat` | ✅ `<strong>`, `<li>`, `<mark class="hl">`, fuentes, sin `**` |
| 4 | Validación temprana de PDF | navegador (`DataTransfer`) | ✅ solo-txt (error + botón off), mixto, solo-pdf |
| 5 | Guard de doble envío en "Analizar" | navegador real | ✅ botón `disabled`, 2.º intento bloqueado |
| 6 | Mensaje de error accionable | **429 real, E2E** | ✅ "Se alcanzó el límite de uso de la IA. Probá de nuevo más tarde." |
| 7 | `friendlyAiError` (mapeo de errores) | unit, 12 casos | ✅ 12/12 |
| 8 | Mensaje de análisis parcial | **stub** de `CV.api.analyze` | ✅ "Analizados 1 de 2 CVs. No se pudo con: corrupto.pdf…" |
| 9 | Estilos nuevos (Markdown + foco `#view`) | computed styles | ✅ `outline:none`, `scroll-margin:92px`, `code` Space Mono |
| 10 | 3 vistas + tema claro/oscuro + consola | navegador real | ✅ todo renderiza, tema alterna, consola limpia |
| 11 | Wordmark SVG vectorial en el navbar | canvas + muestreo de píxeles | ✅ RGB `0,0,0`, 101.9×25.6 px, centrado |
| 12 | Identidad de marca (símbolo, favicon, set de iconos) | `getComputedStyle` + canvas + validación binaria | ✅ `rgb(11,11,11)` 18×18; PNG/ICO válidos; assets servidos con MIME correcto |
| 13 | `DELETE /api/jobs/:id` (registro + PDFs) | HTTP real (vacante descartable) | ✅ `200`; `GET` 404; 2.º `DELETE` 404; PDF borrado del disco; `jobs.json` **byte a byte idéntico** (mismo MD5) |
| 14 | El basurero **no** despliega la tarjeta | navegador real (click CDP) | ✅ diálogo abierto y `aria-expanded="false"` + detalle `hidden` |
| 15 | Borra **sólo** esa vacante y preserva el resto | navegador real | ✅ quedan 5 de 6; la tarjeta desplegada sigue desplegada; toast "Vacante eliminada: …"; foco al toggle vecino |
| 16 | Diálogo de confirmación (a11y + ambos temas) | navegador real | ✅ foco en "Cancelar"; Esc cancela y no borra; `aria-labelledby`/`describedby`; peligro AA en claro `#B3261E`/blanco y oscuro `#FF5B5B`/negro |
| 17 | Orden de tabulación de la fila | teclado (Tab por CDP) | ✅ en cada tarjeta: basurero → toggle; `:focus-visible` con anillo `2px` sobre la fila |
| 18 | Hover del basurero en ambos temas | computed styles | ✅ `#FF7A6B` **literal** en claro y oscuro |
| 19 | Borrar algo ya inexistente (404) | HTTP + UI | ✅ refresca y avisa "Esa vacante ya no existía; actualicé la lista." |
| 20 | Guard de análisis sobre vacante borrada | unit, **sin IA** | ✅ `analyzeJob` → `{ job: null }`; antes `TypeError`, ahora 404 |
| 21 | Diálogo **centrado** en la pantalla | navegador real, 3 tamaños de ventana | ✅ desvío 0 px en 958×888, 485×720 y 900×300; nunca se desborda |
| 22 | `returnValue` no se filtra entre aperturas | navegador real | ✅ Esc → `false`, Cancelar → `false`, Eliminar → `true`; un `close()` posterior a un "ok" → `false` |
| 23 | `DELETE /api/jobs/:id/cvs/:cvId` (registro + PDF) | HTTP real (vacante + CVs descartables) | ✅ `200`; CV fuera del registro; PDF borrado del disco; 2.º `DELETE` 404; CV y vacante inexistentes 404; la vacante real queda en 5 CVs; `jobs.json` y `data/cvs` vuelven al baseline |
| 24 | Un CV borrado sale del ranking **y** del RAG | HTTP + unit, **sin IA** | ✅ `ranking.total` 1→0; CVs con `vector` 1→0; `POST /chat` 1→**400** "Primero tenés que analizar los CVs" (sin llamar a Gemini) |
| 25 | Shredder en los chips de CV (frontend) | navegador real | ✅ confirmación; borra **sólo** ese CV; la tarjeta sigue desplegada; foco al shredder vecino (o al toggle si no quedan CVs); toast "CV eliminado: …"; ranking con 13 chips de skills y **0** shredders |
| 26 | Cancelar el shredder no borra nada | navegador real | ✅ diálogo cerrado; la vacante conserva sus CVs (estado y servidor intactos) |
| 27 | `GET /api/jobs/:id/cvs/:cvId/file` sirve el PDF | HTTP real | ✅ `200`; `Content-Type: application/pdf`; `Content-Disposition: inline; filename*=UTF-8''ana_perez.pdf`; 1951 bytes = archivo en disco; firma `%PDF`; vacante y CV inexistentes → `404` |
| 28 | Abrir el PDF del candidato desde el ranking | navegador real (click CDP) | ✅ ícono 16×16 junto al nombre; abre el PDF en pestaña nueva; el dossier **no** se despliega (sigue `aria-expanded="true"`); el toggle de la placa sigue funcionando |
| 29 | El ícono de abrir no se "cae" de línea | medición en navegador | ✅ los 4 candidatos quedan en 1 línea (Beto 167/168 px); sin el espacio entre nombre e ícono el salto desapareció |
| 30 | Hover del ícono de abrir en ambos temas + teclado | computed styles + Tab por CDP | ✅ `#FF7A6B` **literal** en claro y oscuro; Tab llega al enlace (anillo `2px`) y **Enter** abre el PDF |

**Bug encontrado y corregido durante la verificación (ícono de abrir PDF):** el espacio en
blanco entre el nombre y el ícono era un punto de corte y, en nombres que entraban justos
(Beto Gomez: 143 px de texto en una caja de 168 px), mandaba el ícono solo a la segunda línea.
Se quitó ese espacio (el hueco lo da `margin-left`), así el ícono queda pegado al nombre.

**Bug encontrado y corregido durante la verificación:** en `friendlyAiError` el fallback
leía `error.error` en vez de `parsed.error` (devolvía `null`); se corrigió y se completó con
el mapeo de estados en texto. También se pulió la redacción del aviso de archivos ignorados
("Se ignora 1 archivo que no es PDF").

**Nota:** los ítems 3 y 8 se validaron con *stubs* deterministas (sin llamar a la IA), por lo
que queda pendiente confirmarlos con el modelo real cuando vuelva la cuota (sección 1).

---

## 4. Estado del entorno

- Servidor corriendo con **config original** en `http://localhost:3000/app/` (health 200).
- `jobs.json` intacto — SHA256 `F41B56A2D42FC78989D4B61DBB8F5E4B4758C616A4985164C2C4C961372B3BEB`
  (5 vacantes; 1 analizada con 5 CVs).
- `backend/src/data/cvs/` con 8 PDFs.
- Tras las pruebas de **borrado** (2026-10-12): `jobs.json` volvió al **mismo SHA256**
  (arriba) y `data/cvs/` a 8 PDFs → **sin datos de prueba residuales**.
- Tema del navegador restaurado a `light` (clave `theme` de `localStorage`).
- `.env` **sin modificar** (los overrides de modelo son por variable de entorno).
- Evidencia en `%TEMP%\opencode\cvlight-fix-verify\`:
  `evidencia-{light,dark}-{vacantes,ranking,chat}.png`, `brand-{light,dark}.png`,
  `brand-mark-{light,dark}.png`, backup de `jobs.json` y logs.
- Al recargar CSS/JS usar *cache-buster*: `http://localhost:3000/app/?cb=N`.

### 4.1 Notas técnicas útiles

- **Code Mode no tiene `setTimeout`/timers**: no usar `await new Promise(() => {})`
  (cuelga la ejecución). Para esperar, usar `setTimeout` **dentro de la página** o el shell.
- Si el proceso del server queda en un *job object* y `Stop-Process` da "Acceso denegado",
  terminarlo con:
  `Invoke-CimMethod -InputObject (Get-CimInstance Win32_Process -Filter "ProcessId=<pid>") -MethodName Terminate`.
- Para inyectar archivos en un `<input type="file">` desde consola: `DataTransfer` +
  `dispatchEvent(new Event("change", { bubbles: true }))`.
- El **generador de la identidad** (`build_brand.py`, usa `fontTools`) queda **fuera del
  repo**, en `%TEMP%\opencode\cvlight-brand\`. El repo solo guarda los assets resultantes.

---

## 5. Auditoría de calidad (código) — HECHO

Revisión completa de calidad, estructura, seguridad, escalabilidad y limpieza de código muerto.

### 5.1 Código muerto

- **`top_skills`** en `getRanking`: se calculaba y se servía en `/ranking`, pero el frontend
  nunca lo leía. Retirado.
- **Exports sin uso:** `scoreCv` (scoring), `cosineSimilarity` (retrieval), `API_BASE` (api.js).
- **Token CSS `--band-weak`** (se usan `--band-weak-ink` / `--band-weak-bg`).
- **Comentario muerto** (require comentado) en `chat.routes.js`.
- **`chat.routes.js` + `/api/chat` + `/api/chat/models` se CONSERVAN** (decisión del usuario):
  el `DOCUMENTO` los da por conservados y `GET /api/chat/models` sirve de diagnóstico.

### 5.2 Correcciones

- **Persistencia atómica:** `store.writeJobs` escribe a `jobs.json.tmp` y renombra
  (`rename` es atómico): un corte a mitad de escritura ya no puede truncar el JSON.
- **`GET /api/jobs` ya no manda los vectores (768 floats) ni el texto extraído** de cada CV.
  Se agregó una proyección pública (`publicCv`/`publicJob`) que además quita la `path` en disco.
- **Upload en disco:** multer pasó de `memoryStorage` (hasta ~200 MB en RAM) a `diskStorage`;
  `loadJob` corre **antes** de multer (no escribe nada si la vacante no existe) y se limpian
  los archivos si falla el guardado o el filtro de PDF.
- **Rate limit** en memoria (30 peticiones/min por IP) en `/analyze`, `/chat` y el chat legacy.
- **Análisis con concurrencia limitada:** pool de 3 workers en vez de un `await` por CV.
- **`cosineSimilarity`** valida tipo/dimensión (evita `NaN`); `retrieveRelevantCvs` descarta
  vectores de distinto tamaño que la pregunta.
- **`history` del chat acotado** (últimos 20 turnos × 4000 caracteres); `express.json` con
  límite explícito de 1 MB.
- **`PORT`** se lee de `config.js` (única llamada a `dotenv`); la ruta `/` devuelve un health
  coherente con CVlight. Indentación unificada a 2 espacios.

### 5.3 Decidido no tocar

- `logo.svg` no lo referencia la app: es fuente de marca, se conserva.
- Se agregó `README.md` en la raíz (levantar, env, endpoints, estructura).
