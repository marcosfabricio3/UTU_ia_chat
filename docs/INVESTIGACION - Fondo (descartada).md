# Investigación de fondo — CVlight (dirección “Expediente sobre vidrio”)

> ⚠️ **DOCUMENTO DESCARTADO (contexto histórico).** Esta investigación pertenece a la dirección anterior
> (“Expediente sobre vidrio”, glassmorphism). El proyecto giró a **BRUTALISMO** (blanco/negro/salmón): se
> **eliminaron** del fondo la **grilla/cuadriculado**, la **roseta guilloché** (y su generador), el *wash* y
> la viñeta. La dirección vigente está en **`docs/INVESTIGACION - Brutalismo.md`** y en
> **`docs/PLAN - Frontend CVlight.md`**. Se conserva este texto **sólo** como registro del proceso.

> Objetivo de la investigación: **rediseñar el fondo** para que acompañe la identidad “Expediente sobre
> vidrio” (tinta grafito cálida, ámbar, vidrio esmerilado, sellos/pestañas), sin caer en el “look IA” y sin
> ser un cliché. Resultado: **“papel de seguridad”** (reglado de contabilidad + roseta guilloché generada +
> wash ámbar + grano + cruces de registro).

---

## 1. Qué dice el estado del arte (2026)

**La categoría se partió en dos campos** y “el medio” es lo que queda desactualizado:

| Campo | Rasgos | Referentes |
|---|---|---|
| **Tecno-futurista** | dark por defecto, **un** acento neón, *shaders*/WebGL, bento, tipografía cinética | Linear (violeta), Vercel, Stripe, Attio, Ramp, Cursor (cian) |
| **Editorial** | crema/off-white, **serif** display, aire, ilustración/mascota, poco movimiento | Anthropic (serif, tonos tierra), Notion, PostHog |

Dos conclusiones clave para nosotros:

1. **El campo tecno-futurista está commoditizado** — “individual sites are increasingly hard to tell apart at
   a glance”. Los *tells* ya no son virtud.
2. **La diferenciación no está en la tendencia sino en el punto de vista y el oficio** (“craft and
   commitment”). Lo ganador es **comprometerse con un lenguaje real** y ejecutarlo con más disciplina que el
   resto — no mezclar tendencias.

> Dato útil: **Linear** usa etiquetas tipo “FIG 0.2 / FIG 0.3” que dan aire de **documento técnico** en vez
> de *marketing*. Nuestra dirección “expediente” ya está alineada con eso.

---

## 2. Los “tells” de “hecho con IA” (lo que hay que evitar)

Recurrentes en las fuentes:

- **Tipografía Inter** por defecto (“when a reader sees Inter… the message is that nobody chose anything”).
- **Paleta startup**: azul/violeta/cian, *mesh-gradients* violeta-rosa-cian.
- **Glow / resplandores**, *spotlight* que sigue al cursor, orbes difusos de color.
- **Redes de partículas / líneas conectadas**, blobs.
- **Layouts**: tres tarjetas iguales en fila, todo centrado, “todo es una tarjeta”, grids mal alineadas.
- **Movimiento gratis**: animación del fondo sin función (WCAG 2.2.2 pide pausa).
- **Falta de estados** (hover/focus/loading/empty/error) y detalles de a11y.

**Conclusión operativa:** el fondo no puede ser un degradado de color ni un patrón genérico. Tiene que ser
**específico del tema** y **hecho a mano/oficio**.

---

## 3. Técnicas investigadas (y veredicto)

### 3.1 Dithering ordenado (Bayer) / blue noise
Patrón de umbral (Bayer 4×4/8×8) o ruido azul que “recupera” degradados con 2–N colores. Muy **moderno-retro**
y con oficio. → **Descartado como base**: es tendencia (puede leerse como “retro game”) y no aporta
significado al tema; además compite con el vidrio. (Fuente: Maxime Heckel, “The Art of Dithering”.)

### 3.2 Guilloché (grabado de seguridad)  ✅ elegido
Curvas de **grabado** de billetes/pasaportes/certificados: una sinusoide envuelta en un círculo, con radios
interior/exterior que a su vez ondulan, y varios anillos entrelazados. Es **el lenguaje visual de los
documentos oficiales** y es **matemático** (no clip-art). Fórmulas:

```
r0(t) = ir + sin(t·n0)·h0        (radio interior dinámico)
r1(t) = or + sin(t·n1)·h1        (radio exterior dinámico)
r(t)  = mid + sin(t·nodes/div)·range   ;  t ∈ [0, 2π·div]
```
`nodes` y `div` **no** deben ser múltiplos → si no, sale una estrella. (Fuente: bit-101, “Coding Curves 12”;
ver también generadores de guilloché tipo spirograph.)

### 3.3 Reglado de contabilidad / ledger
Papel de libro contable: renglones + columnas + reglón mayor. Da aire de **planilla/expediente** físico. →
**Adoptado** como capa base (reemplaza la grilla genérica).

### 3.4 Grabado intaglio / líneas de protección
Los billetes se construyen con **líneas y puntos finos** (“protective background lines”), sin estilo
individual. → **Adoptado** como criterio: líneas finas, sistemáticas, cálidas. (No usar ilustración.)

### 3.5 Cruces de registro / marcas de imprenta
Pequeñas cruces de registro en las esquinas (imprenta / dibujo técnico). → **Adoptado** (ya existía).

---

## 4. Decisión

**“Papel de seguridad”: la superficie de un expediente/oficio.** Un CV es un **documento**; su fondo natural
no es un degradado, es **papel de seguridad**. Capas (de abajo hacia arriba):

1. **Reglado** de contabilidad cálido (renglones 28 px, mayor cada 5; columnas tenues; máscara radial).
2. **Roseta guilloché** = **marca de agua** grabada, recortada por el borde inferior derecho.
3. **Un único acento**: wash **ámbar** tenue arriba.
4. **Grano** de papel (SVG `feTurbulence` inline).
5. **Viñeta** cálida.
6. **Cruces de registro** en las esquinas.

**Por qué gana:** es **específico del tema** (documento), usa **oficio real** (guilloché generado con
matemática, no clip-art), y respeta la disciplina de **un solo acento**. No tiene ninguno de los *tells* del
punto 2.

**Herramienta:** el guilloché se genera con Node (sin dependencias) en
`frontend/tools/gen-guilloche.mjs` → `frontend/assets/guilloche.svg` (~55 KB, vectorial, self-hosted).

---

## 5. Verificación (medida, no “a ojo”)

| Qué | Cómo | Resultado |
|---|---|---|
| La roseta aparece | varianza de alta frecuencia en fondo crudo (Chrome headless + `System.Drawing`) | **hf 1.82 (sin) → 5.23 (con)** |
| No “quema” | brillo máximo en la zona de grabado | **52 / 255** (tenue) |
| Base cálida | muestreo de píxeles | **R−B ≈ 6-7** |
| Sin cliché | búsqueda de cian | **0 píxeles cian** |
| No rompe el layout | render real 3 vistas | 3 job-cards · 5 dossiers · chat OK |

---

## 6. Fuentes

- **Estado del arte 2026 / referentes:** toimi.pro “Top 10 Best SaaS Website Designs 2026” (split
  tecno-futurista vs editorial; Linear “FIG 0.2”; Stripe/Vercel/Attio/Ramp/Anthropic/PostHog/Notion).
- **Evitar “look IA”:** medium.com/design-bootcamp “How to stop your frontend looking AI-generated”;
  925studios.co “AI Slop Web Design”; unpromptable.substack.com “5 AI Website Design Tips”;
  dev.to/gdg “Why AI Websites All Look the Same”.
- **Dithering:** blog.maximeheckel.com “The Art of Dithering and Retro Shading for the Web”.
- **Guilloché:** bit-101.com “Coding Curves 12: Guilloche Patterns”; github.com/prabinpebam/guilloche;
  mathling.com/art; generadores spirograph.
- **Grabado/intaglio:** banknoteartconcept.com “Engraving”; Hand Engraving Forum “Bank-Note Engraving”.
- **Papel de contabilidad:** referencias de *ledger paper* / *ruled paper* (Adobe Stock, printablepaper).
- **Estética / contraste de materia:** rauno.me/craft/contrasting-aesthetics.
