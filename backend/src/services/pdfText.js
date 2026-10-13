const fs = require("fs");
const path = require("path");
const { pdfMinTextChars } = require("../config");

// Extracción de texto de un PDF con detección y reordenamiento de columnas.
//
// Por qué existe: mandar el PDF nativo funciona solo con motores que leen PDF
// (Gemini). Los motores de texto (Groq) necesitan el texto plano. Pero una
// extracción ingenua entrevera las columnas de un CV a dos columnas.
//
// Estrategia:
//   1. Se extraen los fragmentos de texto CON su posición (x, y) vía pdf.js.
//   2. Se detecta el "pasillo" (gutter) entre columnas: la x donde muchas líneas
//      tienen un hueco grande y arranca un bloque a la derecha.
//   3. Si hay columnas, se emite la izquierda completa y después la derecha.
//   4. Si el PDF no tiene capa de texto (escaneado) o el resultado es pobre, se
//      devuelve payload "pdf" para que lo lea el motor con visión (Gemini).
//
// Devuelve { payload: "text" | "pdf", text, pages, columns, motivo }.

// Por debajo de esto consideramos que no hay texto útil (escaneado o vacío).
const MIN_TEXT_CHARS = pdfMinTextChars;

// Tolerancia vertical (unidades del PDF) para agrupar fragmentos en una línea.
const ROW_TOL = 3;
// Fracción de líneas que, como máximo, pueden cubrir el pasillo (encabezados).
const GUTTER_MAX_COVER_RATIO = 0.15;
// Ancho del pasillo como fracción del ancho de página (un pasillo es angosto).
const GUTTER_MIN_WIDTH_RATIO = 0.03;
const GUTTER_MAX_WIDTH_RATIO = 0.16;
// Y debe haber texto de ambos lados (fracción del total de caracteres).
const SIDE_MIN_RATIO = 0.12;

let pdfjsPromise = null;

// pdf.js 6 es ESM: se importa dinámicamente (una sola vez) como el SDK de Gemini.
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
}

function standardFontDataUrl() {
  try {
    const dir = path.dirname(require.resolve("pdfjs-dist/package.json"));
    // pdf.js valida que sea una URL con "/" final (en Windows path.sep es "\").
    return path.join(dir, "standard_fonts").split(path.sep).join("/") + "/";
  } catch (e) {
    return undefined;
  }
}

// Fragmentos de texto con posición, página por página.
async function extractItems(filePath) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: standardFontDataUrl(),
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await task.promise;

  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = [];
      for (const it of content.items) {
        const str = String(it.str || "");
        if (!str.trim()) continue;
        const t = it.transform;
        items.push({ str, x: t[4], y: t[5], w: it.width || 0 });
      }
      pages.push({ width: viewport.width, items });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

// Agrupa los fragmentos en líneas (por y, tolerancia ROW_TOL) y los ordena
// izquierda→derecha dentro de cada línea.
function groupRows(items) {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= ROW_TOL) last.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

// Detecta el pasillo (gutter) entre columnas.
//
// Método por proyección vertical: para cada x de la página se cuenta cuántas
// LÍNEAS la cubren. Un pasillo real es una banda angosta y central que casi
// ninguna línea cubre (a lo sumo el encabezado a todo el ancho), con contenido
// denso a ambos lados. Esto es robusto aunque las columnas no estén alineadas
// en y, y evita el falso positivo de las fechas alineadas a la derecha (cuyo
// hueco es enorme, no un pasillo angosto).
function detectGutter(rows, pageWidth, totalChars) {
  const n = rows.length;
  if (n < 4) return null;

  const step = 2;
  const bins = Math.max(1, Math.ceil(pageWidth / step));
  const cover = new Array(bins).fill(0);

  for (const r of rows) {
    const touched = new Set();
    for (const it of r.items) {
      const a = Math.max(0, Math.floor(it.x / step));
      const b = Math.min(bins - 1, Math.floor((it.x + it.w) / step));
      for (let i = a; i <= b; i++) touched.add(i);
    }
    for (const i of touched) cover[i]++;
  }

  const thr = Math.max(1, Math.floor(n * GUTTER_MAX_COVER_RATIO));
  const lo = Math.floor((pageWidth * 0.18) / step);
  const hi = Math.ceil((pageWidth * 0.82) / step);
  const minW = pageWidth * GUTTER_MIN_WIDTH_RATIO;
  const maxW = pageWidth * GUTTER_MAX_WIDTH_RATIO;

  let best = null;
  let i = lo;
  while (i <= hi) {
    if (cover[i] > thr) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 <= hi && cover[j + 1] <= thr) j++;
    const width = (j - i + 1) * step;
    if (width >= minW && width <= maxW) {
      const center = ((i + j) / 2) * step;
      if (!best || width > best.width) best = { x: center, width };
    }
    i = j + 1;
  }

  if (!best) return null;

  // Debe haber contenido real a ambos lados del pasillo.
  let left = 0;
  let right = 0;
  for (const r of rows) {
    for (const it of r.items) {
      if (it.x + it.w / 2 < best.x) left += it.str.trim().length;
      else right += it.str.trim().length;
    }
  }
  if (left < totalChars * SIDE_MIN_RATIO || right < totalChars * SIDE_MIN_RATIO) return null;

  return best.x;
}

function rowsToText(rows) {
  return rows
    .map((r) => r.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function pageToText(page) {
  const rows = groupRows(page.items);
  const totalChars = page.items.reduce((n, it) => n + it.str.trim().length, 0);
  const gutter = detectGutter(rows, page.width, totalChars);
  if (gutter == null) return { text: rowsToText(rows), gutter: null };

  const left = [];
  const right = [];
  for (const r of rows) {
    const li = r.items.filter((it) => it.x + it.w / 2 < gutter);
    const ri = r.items.filter((it) => it.x + it.w / 2 >= gutter);
    if (li.length) left.push({ y: r.y, items: li });
    if (ri.length) right.push({ y: r.y, items: ri });
  }
  return { text: rowsToText(left) + "\n" + rowsToText(right), gutter };
}

// Decide cómo procesar el CV:
//   payload "text" → se manda el texto extraído a cualquier motor.
//   payload "pdf"  → hay que mandar el PDF nativo (escaneado o sin texto útil).
// El modo "pdf" fuerza el PDF nativo (comportamiento previo, sin extracción).
async function extractPdf(filePath, { mode = "auto" } = {}) {
  if (mode === "pdf") {
    return { payload: "pdf", text: "", pages: 0, columns: 0, motivo: "forzado a PDF nativo" };
  }

  let pages;
  try {
    pages = await extractItems(filePath);
  } catch (error) {
    return {
      payload: "pdf",
      text: "",
      pages: 0,
      columns: 0,
      motivo: "no se pudo leer el texto del PDF: " + error.message,
    };
  }

  const parts = [];
  let columns = 0;
  for (const pg of pages) {
    const { text, gutter } = pageToText(pg);
    if (gutter != null) columns++;
    parts.push(text);
  }
  const text = parts
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length < MIN_TEXT_CHARS) {
    return {
      payload: "pdf",
      text: "",
      pages: pages.length,
      columns,
      motivo: "sin capa de texto (escaneado o vacío)",
    };
  }

  return {
    payload: "text",
    text,
    pages: pages.length,
    columns,
    motivo: columns ? `texto extraído (${columns} pág. con columnas reordenadas)` : "texto extraído",
  };
}

module.exports = { extractPdf };
