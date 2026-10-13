// Genera PDFs de prueba para validar la extracción de texto y la detección de
// columnas. Los .pdf resultantes se versionan para no depender de pdfkit en
// tiempo de ejecución (pdfkit es devDependency). Regenerar con:
//   node test/make-fixtures.cjs
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUT = __dirname;

function newDoc() {
  return new PDFDocument({ size: "A4", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
}

function save(doc, name) {
  return new Promise((resolve) => {
    const out = fs.createWriteStream(path.join(OUT, name));
    doc.pipe(out);
    doc.end();
    out.on("finish", resolve);
  });
}

async function twoColumns() {
  const doc = newDoc();
  doc.fontSize(18).text("Ana Pérez", 50, 40, { width: 495 });
  doc.fontSize(10).text("ana.perez@example.com | Montevideo, Uruguay", 50, 64, { width: 495 });

  const leftX = 50;
  const rightX = 320;
  const colW = 230;

  doc.fontSize(12).text("Experiencia", leftX, 100, { width: colW });
  doc.fontSize(9).text(
    "Desarrolladora Backend en Acme (2020-2024). Diseño de APIs REST, microservicios " +
      "y bases de datos PostgreSQL. Lideré un equipo de tres personas.",
    leftX,
    120,
    { width: colW }
  );
  doc.fontSize(9).text(
    "Analista en Globex (2018-2020). Mantenimiento de sistemas legacy y migración " +
      "parcial a la nube.",
    leftX,
    195,
    { width: colW }
  );
  doc.fontSize(12).text("Educación", leftX, 260, { width: colW });
  doc.fontSize(9).text("Ingeniería en Computación, UdelaR, 2018.", leftX, 280, { width: colW });

  doc.fontSize(12).text("Habilidades", rightX, 100, { width: colW });
  doc.fontSize(9).text(
    "Node.js, TypeScript, PostgreSQL, Docker, AWS, Git y metodologías ágiles.",
    rightX,
    120,
    { width: colW }
  );
  doc.fontSize(12).text("Idiomas", rightX, 195, { width: colW });
  doc.fontSize(9).text("Español nativo, inglés avanzado (C1).", rightX, 215, { width: colW });

  await save(doc, "two-column.pdf");
}

async function singleWithDates() {
  const doc = newDoc();
  doc.fontSize(18).text("Juan Gómez", 50, 40);
  const lines = [
    "Experiencia",
    "Desarrollador en Acme",
    "Analista en Globex",
    "Docente en UdelaR",
    "Educación",
    "Ingeniero en Computación",
    "Formación en gestión",
    "Cursos varios",
  ];
  lines.forEach((line, i) => {
    const y = 90 + i * 22;
    doc.fontSize(11).text(line, 50, y);
    doc.fontSize(9).text("2017-2024", 420, y + 2, { width: 90, align: "right" });
  });
  await save(doc, "single-dates.pdf");
}

async function scanned() {
  const doc = newDoc();
  // Solo gráficos: no hay capa de texto, como un PDF escaneado.
  doc.rect(50, 50, 495, 700).fill("#eeeeee");
  doc.fill("#999999").rect(70, 80, 200, 20).fill();
  for (let i = 0; i < 12; i++) {
    doc.fill("#bbbbbb").rect(70, 120 + i * 24, 380 + (i % 3) * 20, 12).fill();
  }
  await save(doc, "scanned.pdf");
}

(async () => {
  await twoColumns();
  await singleWithDates();
  await scanned();
  console.log("Fixtures generados en", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
