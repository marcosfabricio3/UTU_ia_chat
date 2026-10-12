/* =========================================================================
   CVlight — a11y.js
   Utilidades compartidas + patrón ARIA de pestañas (roving tabindex).
   ========================================================================= */
window.CV = window.CV || {};
(function (CV) {
  "use strict";

  /* ---------------- Utilidades ---------------- */

  // Íconos Lucide (lucide-static v1.55.0, licencia ISC) inline, con el trazo en
  // currentColor para heredar el color y adaptarse al tema. Se incluyen sólo los
  // paths usados: no se carga la librería completa (el proyecto no tiene build).
  const ICONS = {
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-up": '<path d="m18 15-6-6-6 6"/>',
    trash:
      '<path d="M10 11v6"/><path d="M14 11v6"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M3 6h18"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    shredder:
      '<path d="M4 13V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5"/>' +
      '<path d="M14 2v5a1 1 0 0 0 1 1h5"/>' +
      '<path d="M10 22v-5"/>' +
      '<path d="M14 19v-2"/>' +
      '<path d="M18 20v-3"/>' +
      '<path d="M2 13h20"/>' +
      '<path d="M6 20v-3"/>',
    "square-arrow-out-up-right":
      '<path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>' +
      '<path d="m21 3-9 9"/>' +
      '<path d="M15 3h6v6"/>',
  };

  const util = {
    // Escapa texto para inyectar en HTML con seguridad.
    esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
      );
    },

    // Ícono Lucide por nombre, como SVG inline. Decorativo (aria-hidden): siempre
    // acompaña a un texto o a un aria-expanded que ya comunica el estado.
    icon(name, size = 16) {
      const path = ICONS[name];
      if (!path) return "";
      return (
        '<svg class="icon icon-' + name + '" viewBox="0 0 24 24" width="' + size + '" height="' + size +
        '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + "</svg>"
      );
    },

    // "ana_perez.pdf" -> "Ana Perez" (nombre legible para mostrar).
    prettifyName(archivo) {
      const base = String(archivo || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      if (!base) return "Candidato";
      return base
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    },

    // Banda de puntaje. Nunca solo color: devuelve etiqueta + clave.
    band(score) {
      const n = Number(score);
      if (n >= 75) return { key: "strong", label: "Fuerte" };
      if (n >= 45) return { key: "partial", label: "Parcial" };
      return { key: "weak", label: "Débil" };
    },

    // Redondea para mostrar (evita 55.600000001).
    round(n, d = 1) {
      const f = Math.pow(10, d);
      return Math.round(Number(n) * f) / f;
    },

    prefersReducedMotion() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    // Resuelve la vacante sobre la que trabaja una vista: la elegida en el panel,
    // luego la "activa" (seleccionada en Vacantes), luego la primera analizada,
    // y como último recurso la primera de la lista. Devuelve el id o null.
    resolveJob(jobs, currentJobId) {
      const list = jobs || [];
      if (!list.length) return null;
      if (currentJobId && list.some((j) => j.id === currentJobId)) return currentJobId;
      const active = CV.app.state.activeJobId;
      if (active && list.some((j) => j.id === active)) return active;
      const analyzed = list.find((j) => (j.cvs || []).some((c) => typeof c.score === "number"));
      return (analyzed || list[0]).id;
    },

    // "<option>" de una vacante para los selects de Ranking/Chat. Reutiliza la
    // misma etiqueta ("(n analizados)" / "(sin analizar)") en las dos vistas.
    jobOption(job, selectedId) {
      const n = (job.cvs || []).filter((c) => typeof c.score === "number").length;
      const label = job.titulo + (n ? " (" + n + " analizados)" : " (sin analizar)");
      return `<option value="${util.esc(job.id)}"${job.id === selectedId ? " selected" : ""}>${util.esc(label)}</option>`;
    },

    // Estado vacío compartido (Ranking y Chat): caja de aviso con botón "Ir a
    // Vacantes". El centrado del botón lo da .empty .btn-row en views.css.
    emptyBox(title, extra) {
      return `<div class="block panel"><div class="empty">
        <span class="empty-title">${util.esc(title)}</span>
        ${extra ? "<p>" + extra + "</p>" : ""}
        <div class="btn-row"><button class="btn ghost small" type="button" data-goto="vacantes">Ir a Vacantes</button></div>
      </div></div>`;
    },

    // Convierte "*texto*" en <mark class="hl">texto</mark> tras escapar.
    // Se usa para resaltar los nombres de candidatos citados por la IA.
    highlightNames(text, names) {
      let safe = util.esc(text);
      const uniq = [...new Set((names || []).filter(Boolean))].sort((a, b) => b.length - a.length);
      for (const name of uniq) {
        const escName = util.esc(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!escName) continue;
        safe = safe.replace(new RegExp(escName, "gi"), (m) => '<mark class="hl">' + m + "</mark>");
      }
      return safe;
    },

    // Markdown mínimo y SEGURO para las respuestas de la IA: escapa primero y
    // luego aplica negrita, itálica, `código`, viñetas y listas numeradas.
    // Solo genera un puñado de etiquetas conocidas, así que no hay XSS posible.
    richText(text, names) {
      const inline = (s) => {
        // Escapa + resalta nombres antes de dar formato (los <mark> no contienen
        // "*", así que las reglas de abajo no los rompen).
        let out = util.highlightNames(s, names);
        out = out.replace(/`([^`]+?)`/g, "<code>$1</code>");
        out = out.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
        out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
        out = out.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");
        return out;
      };

      const lines = String(text == null ? "" : text).split(/\r?\n/);
      const out = [];
      let list = null; // "ul" | "ol" mientras se acumulan viñetas
      const closeList = () => {
        if (list) {
          out.push("</" + list + ">");
          list = null;
        }
      };

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          closeList();
          continue;
        }
        const bullet = line.match(/^[-*•]\s+(.*)$/);
        const numbered = line.match(/^\d+[.)]\s+(.*)$/);

        if (bullet) {
          if (list !== "ul") {
            closeList();
            out.push("<ul>");
            list = "ul";
          }
          out.push("<li>" + inline(bullet[1]) + "</li>");
        } else if (numbered) {
          if (list !== "ol") {
            closeList();
            out.push("<ol>");
            list = "ol";
          }
          out.push("<li>" + inline(numbered[1]) + "</li>");
        } else {
          closeList();
          out.push("<p>" + inline(line) + "</p>");
        }
      }
      closeList();
      return out.join("");
    },
  };

  /* ---------------- Patrón de pestañas ---------------- */
  // tabs: array de botones [role=tab]; onChange(index, tabEl)
  const a11y = {
    tabs(tabButtons, onChange) {
      const tabs = Array.from(tabButtons);

      function activate(index, focus) {
        tabs.forEach((t, i) => {
          const on = i === index;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
        });
        if (focus) tabs[index].focus();
        onChange(index, tabs[index]);
      }

      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => activate(i, false));
        tab.addEventListener("keydown", (e) => {
          let next = null;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = tabs.length - 1;
          if (next != null) {
            e.preventDefault();
            activate(next, true);
          }
        });
      });

      return { activate };
    },
  };

  CV.util = util;
  CV.a11y = a11y;
})(window.CV);
