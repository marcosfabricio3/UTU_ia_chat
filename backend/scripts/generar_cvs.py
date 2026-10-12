# -*- coding: utf-8 -*-
"""
Genera CVs sinteticos (PDF) para la demo de ReclutIA.
No requiere dependencias externas: escribe los PDF a mano.

Uso (desde la carpeta backend/):
    python scripts/generar_cvs.py
Salida:
    <repo>/sample-cvs/*.pdf
"""
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "sample-cvs")

# 5 perfiles con distinto ajuste a la vacante "Desarrollador Frontend"
CVS = {
    "ana_perez": {
        "nombre": "Ana Pérez",
        "titulo": "Desarrolladora Frontend Senior",
        "contacto": "ana.perez@example.com | Montevideo, Uruguay",
        "perfil": "Desarrolladora frontend con 5 años de experiencia construyendo "
                  "interfaces web modernas con React y TypeScript.",
        "experiencia": [
            "TechSolutions (2021 - actual): desarrollo de aplicaciones SPA con "
            "React, Redux y TypeScript. Lideré la migración del código a React Hooks.",
            "Antes: maquetado y componentes reutilizables en HTML y CSS.",
        ],
        "habilidades": "React, Redux, TypeScript, JavaScript, HTML, CSS, Git, "
                       "Jest y consumo de APIs REST.",
        "idiomas": "Inglés técnico (B2).",
        "formacion": "Analista en Tecnologías de la Información, UTU.",
    },
    "diego_ruiz": {
        "nombre": "Diego Ruiz",
        "titulo": "Desarrollador Full Stack",
        "contacto": "diego.ruiz@example.com | Canelones, Uruguay",
        "perfil": "Desarrollador full stack con 3 años de experiencia. Trabajo en "
                  "frontend con React (2 años) y backend con Node.js y Express.",
        "experiencia": [
            "StartupX (2023 - actual): desarrollo de funcionalidades end-to-end con "
            "React y Node.js. Dos años de experiencia específica en React.",
        ],
        "habilidades": "React, Node.js, Express, JavaScript, MongoDB, Git, Docker "
                       "y consumo de APIs REST.",
        "idiomas": "Inglés avanzado (C1).",
        "formacion": "Licenciatura en Informática.",
    },
    "beto_gomez": {
        "nombre": "Beto Gómez",
        "titulo": "Desarrollador Backend",
        "contacto": "beto.gomez@example.com | Montevideo, Uruguay",
        "perfil": "Desarrollador backend con 6 años de experiencia en Node.js y "
                  "bases de datos SQL.",
        "experiencia": [
            "SoftwareFactory (2019 - actual): diseño y desarrollo de APIs REST con "
            "Node.js, Express y PostgreSQL.",
            "Experiencia básica con React (1 año) en tareas de frontend puntuales.",
        ],
        "habilidades": "Node.js, Express, SQL, PostgreSQL, JavaScript y Git.",
        "idiomas": "Sin inglés declarado.",
        "formacion": "Técnico en Programación.",
    },
    "carla_diaz": {
        "nombre": "Carla Díaz",
        "titulo": "Desarrolladora Frontend Junior",
        "contacto": "carla.diaz@example.com | Maldonado, Uruguay",
        "perfil": "Desarrolladora frontend junior con 1 año de experiencia. "
                  "Conocimientos básicos de React.",
        "experiencia": [
            "Agencia Digital (2024 - 2025): maquetado de sitios con HTML y CSS y "
            "componentes básicos en React.",
        ],
        "habilidades": "React (básico), HTML y CSS. Sin experiencia en Git.",
        "idiomas": "Inglés básico (A2).",
        "formacion": "Curso de Desarrollo Web.",
    },
    "elena_sosa": {
        "nombre": "Elena Sosa",
        "titulo": "Diseñadora UX/UI",
        "contacto": "elena.sosa@example.com | Montevideo, Uruguay",
        "perfil": "Diseñadora UX/UI con 4 años de experiencia en diseño de "
                  "interfaces. Sin experiencia en desarrollo frontend ni React.",
        "experiencia": [
            "Estudio Creativo (2021 - actual): diseño de interfaces en Figma, "
            "prototipado y research de usuarios.",
        ],
        "habilidades": "Figma, prototipado, diseño UX/UI y research. Sin React.",
        "idiomas": "Inglés intermedio.",
        "formacion": "Licenciatura en Diseño Gráfico.",
    },
}


def escape(text):
    """Escapa caracteres especiales del operador Tj () y \\."""
    return text.replace("\\", "").replace("(", "").replace(")", "")


def wrap(text, width):
    """Corta un texto en lineas de a lo sumo `width` caracteres (por palabra)."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        if len(current) + len(word) + 1 <= width:
            current = (current + " " + word).strip()
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def build_blocks(cv):
    """Convierte un CV en una lista de (tamano, negrita, texto)."""
    blocks = [(18, True, cv["nombre"]), (12, True, cv["titulo"]), (10, False, cv["contacto"]), (6, False, "")]
    blocks.append((12, True, "Perfil"))
    blocks.append((11, False, cv["perfil"]))
    blocks.append((6, False, ""))
    blocks.append((12, True, "Experiencia"))
    for item in cv["experiencia"]:
        blocks.append((11, False, "- " + item))
    blocks.append((6, False, ""))
    blocks.append((12, True, "Habilidades"))
    blocks.append((11, False, cv["habilidades"]))
    blocks.append((6, False, ""))
    blocks.append((12, True, "Idiomas"))
    blocks.append((11, False, cv["idiomas"]))
    blocks.append((6, False, ""))
    blocks.append((12, True, "Formación"))
    blocks.append((11, False, cv["formacion"]))
    return blocks


def make_pdf(path, blocks):
    ops = []
    y = 760
    for size, bold, text in blocks:
        font = "F2" if bold else "F1"
        width = 55 if size >= 14 else 90
        for line in (wrap(text, width) if text else [""]):
            ops.append("BT /%s %d Tf 50 %d Td (%s) Tj ET" % (font, size, y, escape(line)))
            y -= size + 6
    content = "\n".join(ops)

    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
        "<< /Length %d >>\nstream\n%s\nendstream" % (len(content.encode("latin-1")), content),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]

    out = "%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out.encode("latin-1")))
        out += "%d 0 obj\n%s\nendobj\n" % (i, obj)

    xref = len(out.encode("latin-1"))
    out += "xref\n0 %d\n" % (len(objs) + 1)
    out += "0000000000 65535 f \n"
    for off in offsets:
        out += "%010d 00000 n \n" % off
    out += "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)

    with open(path, "wb") as f:
        f.write(out.encode("latin-1"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, cv in CVS.items():
        path = os.path.join(OUT_DIR, name + ".pdf")
        make_pdf(path, build_blocks(cv))
        print("generado:", os.path.relpath(path))


if __name__ == "__main__":
    main()
