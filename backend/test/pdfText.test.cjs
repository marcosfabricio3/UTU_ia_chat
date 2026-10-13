const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { extractPdf } = require("../src/services/pdfText");

const fixture = (name) => path.join(__dirname, name);

test("PDF a dos columnas: extrae y reordena (izquierda y después derecha)", async () => {
  const r = await extractPdf(fixture("two-column.pdf"));
  assert.strictEqual(r.payload, "text");
  assert.strictEqual(r.columns, 1);

  const lineas = r.text.split("\n");
  const mezcla = lineas.some((l) => l.includes("Experiencia") && l.includes("Habilidades"));
  assert.ok(!mezcla, "las dos columnas no deben mezclarse en una misma línea");

  // Todo el bloque izquierdo va antes que el derecho.
  assert.ok(r.text.indexOf("Educación") < r.text.indexOf("Habilidades"));
  assert.ok(r.text.indexOf("Ingeniería") < r.text.indexOf("Idiomas"));
  assert.ok(r.text.indexOf("Habilidades") < r.text.indexOf("Idiomas"));
});

test("PDF de una columna con fechas a la derecha: NO se confunde con columnas", async () => {
  const r = await extractPdf(fixture("single-dates.pdf"));
  assert.strictEqual(r.payload, "text");
  assert.strictEqual(r.columns, 0, "un hueco ancho no es un pasillo de columnas");

  const linea = r.text.split("\n").find((l) => l.includes("Experiencia"));
  assert.ok(linea.includes("2017-2024"), "la fecha debe quedar junto a su línea");
});

test("PDF sin capa de texto (escaneado): pide el PDF nativo", async () => {
  const r = await extractPdf(fixture("scanned.pdf"));
  assert.strictEqual(r.payload, "pdf");
  assert.strictEqual(r.text, "");
});

test('Modo "pdf": fuerza el PDF nativo sin extraer', async () => {
  const r = await extractPdf(fixture("two-column.pdf"), { mode: "pdf" });
  assert.strictEqual(r.payload, "pdf");
  assert.strictEqual(r.columns, 0);
});

test("Archivo inexistente: cae a PDF nativo sin romper", async () => {
  const r = await extractPdf(fixture("no-existe.pdf"));
  assert.strictEqual(r.payload, "pdf");
});
