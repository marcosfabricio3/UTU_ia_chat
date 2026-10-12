# Plan de Frontend — CVlight

> Parcial 2 — Proyecto de Inteligencia Artificial
> **Dirección final: BRUTALISMO** (neo-brutalismo) — **blanco / negro / salmón, muy marcado**.
> Trazo grueso + **sombra dura** (blur 0) + relleno plano + esquinas rectas. Sin vidrio, sin degradados,
> sin glow, sin grilla. Empresa: **Talento Humano S.A.** · App: **CVlight**.
> Investigación y referencias: `docs/INVESTIGACION - Brutalismo.md`.

---

## 0. Premisa

| | |
|---|---|
| **Sujeto** | Un instrumento de reclutamiento para decidir una lista corta. |
| **Audiencia** | Reclutadora de RRHH (uso diario, escritorio) + jurado de la demo (pantalla grande). |
| **Trabajo principal** | Convertir “cientos de CVs” en **un ranking justificable** y **responder preguntas con evidencia**. |
| **Emoción buscada** | Seriedad y trazabilidad, con **carácter** (una herramienta con opinión, no “app genérica”). |

**Lo que NO vamos a hacer** (los tics que delatan una página generada por IA): **gradiente neón**
(púrpura/cian), ***glassmorphism*** decorativo (blur porque sí), **glow** en botones y cantos, ***mesh*
gradients*, orbes difusos, tipografía **Inter** por defecto y la “SaaS-card kit” de tarjetas idénticas.
La estética de esta entrega es **lo contrario**: el **brutalismo** se apoya en la **estructura visible** y
en el **color plano**, no en la profundidad falsa.

**Anti-genérico aplicado al brutalismo:** los bloques **no** son tarjetas fantasma idénticas — cada uno lleva
**borde negro de 3px** y **sombra dura**, el **canto izquierdo se tiñe por banda** (franja pegada), los sellos
son **rectángulos**, y el **cuerpo de texto es calmado** (Instrument Sans sobre blanco) aunque el marco sea
ruidoso. La regla que gobierna todo: **expresión en el marco, legibilidad en el contenido**.

---

## 1. Concepto: “CVlight — el tablero estampado”

**La idea memorable (una sola):** ***la estructura es el diseño***.
No hay adorno agregado: **el borde grueso, la sombra dura y el color plano son el diseño**. Es un **tablero
estampado** (serigrafía / afiche / ficha de archivo) donde cada dato está **enmarcado y rotulado**, y el
“pegado” se ve (sombra desplazada, como un *sticker*).

La segunda idea se conserva de la etapa anterior y sigue vigente: ***el color es dato***.
La UI es **blanca y negra**; el **salmón** es el único acento (acciones, navbar, selección) y las **3 bandas
de puntaje** se imprimen como **sellos** (negro / salmón / trama) **+ etiqueta + forma**. El **resaltador** de
la cita de la IA es un **bloque salmón plano**.

**Tagline:** *CVlight — Ordená el proceso. La decisión sigue siendo tuya.* (refuerza el human-in-the-loop).

---

## 2. Sistema de tokens (claro por defecto · oscuro opcional)

### 2.1 Color

Paleta **corta y valiente**: 3 colores + neutros derivados + **un** rojo funcional para error.

```css
:root {
  /* ---- Los 3 colores ---- */
  --paper:  #FFFDF5;   /* fondo de página (off-white) */
  --card:   #FFFFFF;   /* superficies / tarjetas */
  --ink:    #0B0B0B;   /* texto */
  --line:   #000000;   /* trazo estructural (bordes y sombras) */

  /* Salmón: ÚNICO acento. Sobre él va tinta negra (7.73:1, AAA). */
  --salmon:      #FF7A6B;
  --salmon-ink:  #0B0B0B;
  --salmon-tint: #FFE7E1;   /* relleno suave (hover, burbuja del bot) */

  /* Neutros derivados (jerarquía sin salir de la paleta) */
  --ink-2:   #1A1A1A;   /* texto secundario (17.09:1, AAA) */
  --ink-3:   #3D3D3D;   /* etiquetas / metadatos (10.67:1, AAA) */
  --paper-2: #F1ECE0;   /* relleno secundario (tracks, pozos) */
  --line-2:  #BDBDBD;   /* trazo secundario / punteado */

  /* Trazos (regla #1) */
  --line-w: 3px;  --line-w-thin: 2px;  --line-w-thick: 4px;

  /* Sombras duras, blur 0 (regla #2): la sombra se dibuja con el TRAZO, así que
     en modo oscuro rota a salmón con él. */
  --shadow-color: var(--line);
  --hard-sm: 3px 3px 0 0 var(--shadow-color);
  --hard:    5px 5px 0 0 var(--shadow-color);
  --hard-lg: 8px 8px 0 0 var(--shadow-color);

  /* Forma: esquinas rectas (regla #3) */
  --radius-frame: 0;  --radius-well: 0;  --radius-chip: 0;

  /* Pozos (superficie de lectura) */
  --well-fill: var(--paper);  --well-stroke: var(--line);

  /* Bandas: negro / salmón / blanco+trama (+ etiqueta) */
  --band-strong: #000000;  --band-strong-ink: #FFFFFF;
  --band-partial:#FF7A6B;  --band-partial-ink:#0B0B0B;
  --band-weak:   #FFFFFF;  --band-weak-ink:   #0B0B0B;

  --track: var(--paper-2);
  --focus: #0B0B0B;          /* anillo de foco (visible sobre blanco y salmón) */
  --mark:  var(--salmon);    /* resaltador de la IA (bloque plano) */
  --danger:#B3261E;          /* rojo funcional, SÓLO error (6.42:1) */
}
```

**Modo oscuro = “el negativo”** (`html[data-theme="dark"]`, control en la navbar): los **tres colores rotan de
rol**, no se atenúan.

| Rol | Claro | Oscuro |
|---|---|---|
| Papel / superficie | `#FFFDF5` / `#FFFFFF` | `#0B0B0B` / `#000000` |
| Tinta / trazo (`--ink`, `--line`, sombra) | `#0B0B0B` / `#000000` | **`#FF7A6B` (salmón)** |
| Acento (`--salmon`: navbar, botones, sellos, resaltador) | `#FF7A6B` | **`#FFFFFF` (blanco)** |

En oscuro `--salmon` ya **no es “el color salmón”**: es el **ROL de acento** (= blanco). Por eso `--ink`,
`--line`, las bandas y `--shadow-color` llevan el salmón **literal**. La **jerarquía secundaria** va por
**neutros** (blanco apagado: `#EDE4E1` 15.7:1 · `#CBBDB9` 10.8:1), igual que en claro va por grises sobre
blanco — sobre negro, **oscurecer** el salmón sólo resta contraste. Las **3 bandas rotan en ciclo**
(negro/blanco → salmón/negro · salmón/negro → **blanco/negro** · blanco/negro → negro/salmón), todas ≥8:1; la
banda **parcial** no sigue la rotación literal porque *blanco + tinta salmón* daría **2.55:1** → su tinta queda
negra. El **rojo funcional** (`--danger`) es el único color que **no rota**: es estado, no decoración.

**Bandas de puntaje (color + etiqueta + forma, nunca solo color):**

| Banda | Rango | Sello | Forma |
|---|---|---|---|
| Fuerte | 75–100 | fondo **negro** + texto claro | cuadrado relleno / barra plena |
| Parcial | 45–74 | fondo **salmón** + texto negro | ídem |
| Débil | 0–44 | fondo **blanco** + borde + texto negro | **trama diagonal** (barra rayada) |

### 2.2 Tipografía (self-hosted) — **Archivo Black + Space Grotesk + Instrument Sans + Space Mono**

Las familias se cargan **desde `frontend/assets/fonts/`** (la demo funciona **sin internet**). Son **OFL
(libres)** → se incluyen los `.woff2` (subset **Latin**) + sus licencias en el repo, con `font-display: swap`.

| Rol | Familia | Archivo |
|---|---|---|
| **Display** (wordmark, títulos, score) | **Archivo Black** | `archivo-black-latin-400.woff2` |
| **Titulares / UI / controles** | **Space Grotesk** (variable) | `space-grotesk-latin-var.woff2` |
| **Cuerpo** (calmado a propósito) | **Instrument Sans** (variable) | `instrument-sans-latin-standard.woff2` |
| **Etiquetas + datos** (mono) | **Space Mono** | `space-mono-latin-400/700.woff2` |

Por qué este cuarteto (según la investigación): display de **impacto** (“no ornament, just weight”),
titulares con **carácter estructural**, cuerpo **aburrido a propósito** para no cansar, y **monoespaciada
brutalista** para etiquetas/datos. Se **abandonan** Fraunces (serif) y JetBrains Mono del *look* “expediente”.
Los números van **tabulares** (`font-variant-numeric: tabular-nums`).
**Escala** (rem, 1rem=16px): display/score `2.5–3.5rem` · h1 `2rem` · panel-title `1.35rem` · cuerpo `1rem/1.6`
· etiqueta `0.75–0.8125rem`. Ancho de línea ≤ 72ch.

**Piso micro (`--fs-micro`)** — *refinamiento*: ninguna etiqueta funcional baja de **12px** (la mono por debajo
de ese tamaño se vuelve ilegible). Dos escalones relativos: `--fs-micro: .8125rem` (**13px**, metadatos y chips)
y `--fs-micro-2: .75rem` (**12px**, sellos y rótulos cortos). Se corrigen **tres palancas a la vez**: tamaño
(piso 12px) + **peso 700** (la mono regular es fina) + **tracking corto** (`--track-micro: .06em`) — mayúscula
+ tracking largo + letra chica = fatiga. Aplicado a `.jm`, `.j-status`, `.chip`, `.d-file`, `.band`,
`.stat .k`, `.d-section h4`, `.field label`, `.toolbar label`, `.msg .who`, `.srcs .src`, `.stamp` y el label
del toggle. Todo en `rem` → escala con el tamaño de fuente del usuario.

### 2.3 Forma y espaciado
- **Radius: `0` en todo** (regla #3). Nada de píldoras ni esquinas redondeadas.
- **Trazo**: borde `3px` por defecto (`2px` fino, `4px` estructural) siempre en `--line`.
- **Sombra**: **una** por bloque, **dura** (blur `0`), desplazada derecha-abajo (`3/5/8px`). Las piezas
  estructurales llevan la grande. **Sin glow, sin degradados.**
- **Espaciado**: escala 4/8 (`--s1:4 … --s8:64`).
- **Fondo**: **plano** (`--paper`) + grano de papel apenas perceptible (ver 2.5).

### 2.4 Movimiento (mínimo y con sentido)
- **Un gesto por acción:** el bloque/botón **“entra en su propia sombra”** — *hover* `translate(-2px,-2px)`
  y la sombra **crece** (`--hard-lg`); *active* `translate(2px,2px)` y la sombra **se apaga** (`none`).
  Duración **≤90 ms** (una transición suave rompería el estilo duro).
- **Una** entrada: al abrir *Ranking*, las placas se asientan y **el número del score cuenta** hasta su valor.
- **Un** gesto de IA: el **resaltador salmón** aparece sobre el fragmento citado.
- **El fondo es estático** (sin deriva ni foco de cursor).
- Todo apagado bajo `prefers-reduced-motion`.

### 2.5 Fondo: papel plano + **malla de puntos** + grano
`css/background.css` mantiene el canvas **plano** (`--paper`) y **agrega** una **malla de puntos negros**
(retícula de `20px`, punto de radio `1.65px` — **≈4px de diámetro medido** en captura, `radial-gradient`
inline, opacidad `.38`): da **textura y
contraste** con el papel en los márgenes, como papel milimetrado / trama serigráfica. Usa `--line`, así que en
**modo oscuro** los puntos **rotan solos a salmón** (el trazo del tema oscuro, `opacity .40`). *(Refinamiento: el
punto se engrosó de `1.25px`/`.34` a `1.65px`/`.38` para subir el contraste con el fondo.)* Encima, un **grano** muy tenue
(`feTurbulence` inline, `.04`, sin requests). Se **eliminaron** de la etapa anterior la **grilla/cuadriculado**,
la **roseta guilloché** (y su generador `tools/gen-guilloche.mjs`), el *wash* y la viñeta. Los bloques son
opacos, así que **los puntos viven en los márgenes/gutters** y no compiten con el texto. El interés principal
lo siguen aportando los **bloques** (trazo + sombra + color).

---

## 3. Primitivas de bloque + pozo + sello

```css
/* BLOQUE: tarjeta/panel (reemplaza al antiguo “vidrio”) */
.block { background:var(--card); border:var(--line-w) solid var(--line);
         border-radius:0; box-shadow:var(--hard); position:relative; }
.block--thin  { box-shadow:var(--hard-sm); }              /* grupos flotantes (tabs, toolbars) */
.block--frost { border-width:var(--line-w-thick); box-shadow:var(--hard-lg); }  /* navbar, columna */

/* POZO: superficie de lectura (contrasta con la tarjeta) */
.well { background:var(--well-fill); border:var(--line-w-thin) solid var(--well-stroke); border-radius:0; }

/* SELLO: chip/etiqueta (rectángulo + mono, sin radius) */
.stamp { font-family:var(--font-mono); font-size:var(--fs-micro-2); font-weight:700;
         letter-spacing:var(--track-micro); text-transform:uppercase; padding:3px 9px;
         border:var(--line-w-thin) solid var(--line); border-radius:0; box-shadow:var(--hard-sm); }

/* INTERACCIÓN: “entrar en la propia sombra” */
.block--lift { transition: transform .09s ease, box-shadow .09s ease; }
.block--lift:hover, .block--lift:focus-within { transform:translate(-2px,-2px); box-shadow:var(--hard-lg); }
.block--lift:active { transform:translate(2px,2px); box-shadow:none; }
```

**Regla de oro:** el texto largo va sobre un **pozo** (`.well`, fondo `--paper` sobre la tarjeta blanca), para
que el borde grueso no canse. Los archivos pasaron a llamarse **`css/blocks.css`** (antes `glass.css`): la
interfaz **ya no es glassmorphism**. Los nombres de clase del HTML/JS se renombraron en consecuencia
(`.glass → .block`).

---

## 4. Layout (bloques sobre el canvas plano)

El **canvas** es plano. Sobre él vive el **shell** de la app:

- **Navbar a todo el ancho** (`position: sticky; top: 0`): **bloque salmón**, borde inferior grueso + sombra
  dura, esquinas rectas. Marca a la izquierda · tabs al centro · **“Modo oscuro”** a la derecha.
- **Columna izquierda persistente** (`#sidebar`, `position: fixed`): aloja el formulario **“Nueva vacante”**,
  pegada al borde izquierdo y **fusionada con la navbar** (`top: var(--nav-h)`; el alto real lo mide JS), con
  **sólo borde derecho grueso**. Presente en **las 3 vistas**.
- El **contenido** (`.content → .app`) se desplaza a la derecha de la columna y se centra a `1180px`.
- **Footer de cierre** (`<footer class="foot">`, tras el contenido): **el negativo de la navbar** — banda de
  **tinta** (`--ink`) con **regla superior de papel 2px** (`--paper`), texto papel (**19.33:1**); en oscuro rota
  a **salmón** con tinta negra (**7.73:1**) y regla negra. Marca **en línea** + **atajos** a las 3 vistas
  (`#vacantes` … con hover de **subrayado fino 2px**, sin chip) + créditos técnicos (`Parcial 2 · IA` ·
  `Vanilla JS · RAG + Gemini`) + nota *“Empresa ficticia · los resultados se revisan con criterio humano”* en
  **una línea**. Vive a la derecha de la columna (`margin-left: var(--sidebar-w)`, reseteo ≤900px; foco papel
  sobre la banda). **Pegado al fondo del viewport** (sticky footer): el body es una columna flex
  (`min-height: 100vh`) y `.content` crece con `flex: 1 0 auto` — en vistas cortas (Vacantes) el footer abraza
  el borde inferior (verificado: 0px de hueco, sin scroll fantasma); en vistas largas (Ranking/Chat) queda al
  final del documento. **66px de alto** (versión discreta). Capturas `25`/`26` (Ranking), `27`/`28` (Vacantes)
  y `29`/`30` (discreto, Vacantes).

### Vista 1 — Vacantes
```
  ■ CVlight          〔Vacantes〕 Ranking  Chat        ☐ Modo oscuro
  ┌── columna izquierda (fija, salmón/roja) ─┐ ┌─ UN solo bloque (el panel) ─────┐
  │ Nueva vacante                            │ │▓▓▓ Vacantes · 4 vacantes ▓▓▓▓▓▓▓│ ← cabecera
  │ Título [_____________]                   │ │ ━━━━━━━ línea 4px ━━━━━━━━━━━━━ │   SALMÓN
  │ Reqs   [_____________]                   │ │ Desarrollador Frontend [ANALIZADA]│
  │ Desc   [_____________]                   │ │ 5 CVs · 5 analizados            │
  │ [ CREAR VACANTE ]  (salmón + sombra)     │ │ ━━━━━━━ regla gruesa 4px ━━━━━━ │
  └──────────────────────────────────────────┘ │ Diseñador UX       [SIN ANALIZAR]│
                                               │ 0 CVs (baja hasta el marco)     │
                                               └──────────────────────────────────┘
```

**Opción C — “filas sobre tablero”** *(refinamiento)*: las vacantes **dejaron de ser cajas** (el `<li>` ya no
lleva `.block`/`.block--lift`). Se **funden con el panel padre**, que queda como **único marco**, y se separan
entre sí con una **regla negra gruesa** (`4px`, `--line-w-thick`) **a sangre** hasta el marco
(`margin-inline: calc(-1 * var(--s5))`, con `padding-inline: var(--s5)` para que el contenido siga alineado al
título). Resuelve de una sola vez **(a)** la falta de aire entre items y **(b)** la ambigüedad “caja dentro de
caja” del padre. Aire vertical **relativo** (`padding-block: .75rem` → ≈**28px** entre textos, contra los ≈7px
efectivos de antes: la sombra dura de 5px casi anulaba el gap de 12px). Afordancia sin caja → **fila resaltada**
(`.job-card:hover { background: var(--salmon-tint) }`). En **Ranking** las fichas **siguen siendo cajas** (no
están dentro de un `.panel`: no había conflicto padre/hijo, y la ficha-bandera es el “producto” del análisis).

**Remate del tablero** *(refinamiento)*: tres arreglos sobre lo anterior.

1. **Línea padre → primer hijo**: la regla (`border-top` del `.job-card`) pasó a aplicarse a **todas** las filas,
   no sólo al hermano siguiente (`.job-card + .job-card`). Así la **primera** fila también queda separada de la
   cabecera, y el panel se lee como **tabla**: cabecera, línea, filas.
2. **Cabecera salmón (`.panel--board .panel-title`)**: la zona superior **visible** del panel padre se pinta con
   `--salmon` y **sangra hasta el marco** (`margin: calc(-1*var(--s5)) calc(-1*var(--s5)) 0` + `padding:
   var(--s5) var(--s5) var(--s4)`). La tinta es `--salmon-ink` (#0B0B0B, **7.73:1 AAA**), también en el conteo
   (`.sub`). Es **la única superficie salmón “grande”** del panel y marca la jerarquía padre *vs.* hijos. Clase
   `panel--board` (sólo Vacantes): la columna lateral y los paneles de Chat/Ranking no se tocan. En oscuro la
   cabecera **rota a blanco** (el acento) con tinta negra (**19.68:1**); el estado **vacío** recupera su aire con
   `margin-top: var(--s5)` porque la cabecera ya no aporta margen inferior.
3. **Última fila hasta el marco**: el relleno de las filas es **uniforme** (`padding-block: .75rem` en todas) y
   se eliminaron los reset `:first-child`/`:last-child`, que dejaban la primera y la última caja **más chicas**
   (0px de un lado) y por tanto su **resalte de hover más corto** — el “recorte” que se notaba abajo. Además la
   última fila **baja hasta el marco** (`padding-bottom: var(--s5)` + `margin-bottom: calc(-1*var(--s5))`, que
   cancela el `padding-bottom` del panel y lo traslada a la fila): su hover llena el tablero **hasta el borde**.

### Vista 2 — Ranking (la pantalla del dinero)
```
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ← cabecera SALMÓN
  ▓ Desarrollador Frontend  [distribución]  PROMEDIO 55.6 · CVS 5  ▓   (como la de Vacantes)
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   tinta negra 7.73:1
  ┌── bloque ────────────────────────────────────────────────────┐
  │░1  Ana Pérez          98  ▓FUERTE▓  5 años              ⌄    │ ← franja de banda negra
  │░   ana_perez.pdf · Desarrolladora frontend con 5 años…        │
  │ ┌── pozo de lectura (al expandir) ─────────────────────────┐  │
  │ │ EXPERIENCIA · RESUMEN · FORTALEZAS · BRECHAS · SKILLS    │  │ ← secciones en mono
  │ └──────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────┘
  ┌── 2  Diego Ruiz       88  ▓PARCIAL▓ 3 años  ⌄ ────────────────┐
  ...
```
El **puntaje** es un **sello numérico** (fondo negro/salmón/blanco, número en Archivo Black). Los **números
de orden sí van** (un ranking *es* una secuencia).

**Cabecera en salmón (refinamiento):** la **cabecera** — el nombre del puesto, la distribución y los KPIs
`CVs`/`Promedio` — se pinta con **salmón sólido** (`--salmon`) y tinta `--salmon-ink` (negro, **7.73:1 AAA**),
igual que la cabecera del tablero de Vacantes: **la vacante “es” salmón en las dos vistas**. En oscuro rota a
**blanco** con la misma tinta negra (**19.68:1**). Las barras de distribución conservan su borde de trazo y
siguen leyéndose sobre el fondo salmón/blanco.

**Más aire y hover con color (refinamiento):** los **componentes de cada dossier** se **separan** un escalón en
toda la escalera vertical: **entre fichas** 12→**24px** (blanco real ≈19px con las sombras), relleno del
bloque (16→20 → **24px** de aire
horizontal y el canto de banda pasa de 28→**30px**), cabecera del dossier (gap 16→**24px**, nombre/archivo/sumo
4px), pozo de lectura 20→**24px** y secciones 16→**24px**. Al **hover**, la ficha **suma el relleno tenue** de
las filas de Vacantes (`--salmon-tint`: `#FFE7E1` claro / `#2E1512` oscuro) **sin perder** el *lift* y la
sombra de `.block--lift` (el relleno se agrega a la transición).

**Jerarquía de encabezados (arreglo a11y):** el título de la cabecera pasa de `<div>` a **`<h3>`**; las
secciones del pozo quedan en **`<h4>`** → la jerarquía visible es `h2` (sidebar) → `h3` (vacante) → `h4`
(secciones) y Lighthouse vuelve a 100 con un dossier **expandido**.

### Vista 3 — Chat (tinta sobre bloques)
```
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ← selector SALMÓN
  ▓ VACANTE [Desarrollador Frontend ▾]   (sin analizar → chip ⚠)    ▓   (como las cabeceras)
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  ┌─────────────────────── marco 3px ─────────────────────────────┐   ← #chat-log con
  │  VOS: ¿Quién tiene más experiencia con React?                 │     borde sólido
  │  ■ CVLIGHT: Ana Pérez, 5 años (2021–actual)…                 │
  │  ⌈evidencia⌉  [ Ana Pérez ] [ Diego Ruiz ]   ← fuentes        │
  │  “React, Redux y TypeScript…”   ← RESALTADO salmón plano      │
  └─────────────────────── marco 3px ─────────────────────────────┘
     [ Escribí tu pregunta…              ]  [ ENVIAR ]
```

**Selector en salmón + log con marco (refinamiento):** la **barra del selector de vacante** del Chat se pinta
con **salmón sólido** y tinta `--salmon-ink` (label **7.73:1 AAA**), igual que las cabeceras del tablero y del
Ranking: la conversación “cuelga” de la vacante. El select queda como **control blanco** sobre la banda; el
avisador **“Analizá los CVs primero.”** pasa a **chip** (papel + rojo funcional, **6.42:1** en claro). El
**`#chat-log`** recibe un **marco sólido** (`--line-w` 3px) que lo separa del resto del panel; las burbujas,
las fuentes y el resaltado quedan dentro de ese marco. **En oscuro** la barra rota a **blanco** (19.68:1), el
chip a negro + rojo (6.9:1) y el marco pasa a **salmón**.

**Responsive:** una columna. En **≤900 px** la columna izquierda deja de ser fija y se **apila arriba** con
borde duro + sombra; las tabs pasan a *segmented control*. Sin scroll horizontal. *(Verificado a 500 px.)*

---

## 5. Accesibilidad

El brutalismo tiene tres trampas y **todas** están cubiertas:

| Riesgo (del estilo) | Solución en CVlight |
|---|---|
| El borde grueso **traga el foco** | `:focus-visible` **siempre** visible: anillo `3px` + offset. En claro **negro** (visible sobre blanco y salmón); en oscuro el **acento blanco**; dentro de la navbar (salmón en claro, blanca en oscuro) el anillo es **tinta de barra** (`--salmon-ink`). |
| Texto sobre el acento **(bajo contraste)** | **Nunca** texto blanco sobre salmón. Sobre salmón va **tinta negra = 7.73:1 (AAA)**. |
| Distinguir bandas **sólo por color** | Banda = **color + etiqueta de texto + forma/trama** (negro / salmón / blanco rayado). |
| Cansancio en datos densos | Marco **ruidoso**, contenido **calmado**: cuerpo en Instrument Sans sobre pozos blancos; jerarquía clara. |
| Modo claro/oscuro | `data-theme` + `color-scheme` correcto por tema; en oscuro tinta/trazo/sombra pasan a **salmón** y el acento a **blanco** (rotación de los 3 colores). |
| `prefers-reduced-motion` | Apaga el *settle*, el *count-up* y las transiciones de hover/active. |

**Contraste medido (WCAG, valores reales):** tinta/papel **19.33** · **tinta/salmón 7.73** · tinta-2 `#1A1A1A`
**17.09** · etiquetas `#3D3D3D` **10.67** · blanco/negro **21** · error **6.42** · **modo oscuro** (rotación):
tinta salmón sobre negro **7.73–8.25** · tinta-2 `#EDE4E1` **15.7** · etiquetas `#CBBDB9` **10.8** · bandas
**8.25 / 21 / 8.25** · error `#FF5B5B` **6.9** — **todo AA, la mayoría AAA**. *(Refinamiento: tinta-2 bajó de
**13.9** y las etiquetas de `#5F5F5F` **6.27** a los valores actuales.)*

**Resto de a11y (se mantiene):**
- **Estructura**: landmarks `header/nav/main`, jerarquía `h2→h3→h4` (título de la vacante en Ranking = `h3`,
  secciones del dossier = `h4`; corregida al expandir), listas reales, `lang="es"`.
- **Tabs**: patrón ARIA `tablist/tab/tabpanel` con `aria-selected`, `aria-controls`, **roving tabindex** +
  flechas ←/→, Inicio/Fin.
- **Formularios**: `<label for>` siempre; ayudas con `aria-describedby`; errores `aria-invalid` + texto.
- **Chat**: respuestas en `aria-live="polite"`; estados con `role="status"`.
- **Ranking**: lista semántica; estado de cada vacante con chip textual.
- **Subida**: `<input type="file">` real, operable por teclado; anuncia “5 CVs cargados”.
- **Zoom**: medidas en `rem`, probado a 200% · **Skip link** a contenido.
- **Auditoría:** **Lighthouse Accessibility 100** (Agentic browsing 100).

---

## 6. El color–dato

- Canvas **plano blanco** (`--paper`) + **malla de puntos negros**; estructura en **negro** (trazo + sombra);
  superficies **blancas**.
- Acento de **UI** (acciones, navbar, tab activa, links) y de **dato** (las **cabeceras** del tablero de
  Vacantes y del Ranking): **salmón**. El resto es **monocromo**.
- Croma **de dato**: las **3 bandas** (sellos negro / salmón / blanco-trama) + el **resaltador salmón** de la
  IA. El **canto del bloque de cada dossier se tiñe con su banda** (franja izquierda de 14px): el dato
  “marca” el bloque.
- **Modo oscuro**: invierte tinta y papel **y rota los tres colores** (salmón → blanco · blanco → negro ·
  negro → salmón). El dato se mantiene legible: la tinta salmón sobre negro (7.73:1), las bandas en ciclo
  (8.25 / 21 / 8.25) y el resaltador de la IA en blanco con tinta negra.

---

## 7. Skills y proceso

- **`frontend-design`** → disciplina: tokens primero, **una** apuesta fuerte (la estructura dura), restraint y
  **auto-crítica con capturas**. Antes de construir cada vista, revisar contra este brief.
- **`canvas-design`** → lo que es imagen: **wordmark “CVlight”** (bloques desplazados) e **ilustración de
  estado vacío** (una ficha vacía). Más adelante, la portada de las slides.
- **Verificación** → levantar, **capturar** cada vista (claro y oscuro) y **medir**: contraste WCAG, paleta
  por muestreo de píxeles (`System.Drawing`), estilos computados vía *Chrome DevTools*, **Lighthouse**.
- **Internet** → investigación de referencias/librerías (ver `INVESTIGACION - Brutalismo.md`); se **rechazó**
  instalar librerías React/Tailwind por ser otro stack.

---

## 8. Estructura de archivos (sin build)

```
frontend/
  index.html            # estructura + ARIA (navbar salmón, columna, 3 paneles)
  calibration.html      # placa de calibración (histórica)
  compare-fonts.html    # comparador de fuentes (histórico)
  style-explorer.html   # explorador de estilo (histórico, variantes claras)
  css/
    tokens.css          # variables (blanco/negro/salmón · modo claro + oscuro)
    base.css            # reset, tipografía (display/heading/ui/mono), foco, a11y base
    background.css      # papel plano + MALLA DE PUNTOS negros + grano (sin grilla, sin roseta)
    blocks.css          # primitivas de BLOQUE + pozos + sellos + interacción (antes glass.css)
    views.css           # layout y componentes por vista
    style-variants.css  # SOLO para el explorador histórico
  js/
    api.js              # capa fetch al backend
    app.js              # router simple + estado + preferencia de TEMA (claro/oscuro)
    views/vacantes.js   # vista 1
    views/ranking.js    # vista 2
    views/chat.js       # vista 3
    a11y.js             # patrón de tabs, foco, live regions
  assets/
    favicon.svg         # marca (bloques desplazados)
    fonts/fonts.css     # @font-face (Archivo Black + Space Grotesk + Instrument Sans + Space Mono)
    fonts/*.woff2       # + licenses/
    img/*               # wordmark, ilustración de vacío
```

> Se **eliminaron** `assets/guilloche.svg` y `tools/gen-guilloche.mjs` (roseta descartada).

---

## 9. Orden de trabajo

1. ✅ **Placa de calibración**: tokens + fuentes + primitivas. Contraste medido.
2. ✅ Base + **a11y scaffolding** (`base.css`, patrón de tabs con teclado, skip link, foco).
3. ✅ Vista **Vacantes** · 4. ✅ Vista **Ranking** · 5. ✅ Vista **Chat**.
6. ✅ **Re-skin “Expediente sobre vidrio”** (etapa intermedia, hoy superada).
7. ✅ **Re-skin “papel de seguridad”** (etapa intermedia, hoy superada).
8. ✅ **REFACTOR A BRUTALISMO** (dirección final): paleta blanco/negro/salmón; tipografías Archivo Black +
   Space Grotesk + Space Mono (self-hosted); `blocks.css` con borde + sombra dura; `views.css` re-tintado;
   **fondo: papel plano + malla de puntos** (grilla y roseta eliminadas); navbar salmón; bandas como sellos
   negro/salmón/trama;
   **modo oscuro** (ex “disminuir transparencia”); favicon; `<meta description>`.
9. ✅ **Verificación**: Lighthouse **a11y 100**; contraste WCAG medido; muestreo de píxeles de las 5 capturas
   (claro/oscuro); responsive ≤900 px; **`glass.css → blocks.css`** y `.glass → .block`.
10. ✅ **Refinamiento 1** (feedback del usuario): puntos del fondo **más gruesos** (1.25→1.65px); **tinta más
    negra** en los textos que hay que leer (`--ink-2` #2B2B2B→#1A1A1A, `--ink-3` #5F5F5F→#3D3D3D) y varios
    promovidos a negro pleno; **hover oscuro de fila** arreglado (`--salmon-tint` = #3A211C en oscuro).
11. ✅ **Refinamiento 2**: **piso micro** de tipografía (12–13px + peso 700 + tracking corto); **Opción C** en
    Vacantes (filas separadas por regla gruesa en vez de cajas anidadas) con aire **relativo** (~28px).
12. ✅ **Refinamiento 3** (feedback del usuario): regla **padre → primer hijo** (la regla se aplica a todas las
    filas); **cabecera salmón a sangre** del panel de Vacantes (`panel--board`, tinta 7.73:1); **relleno
    uniforme** de las filas (13px) y **última fila hasta el marco** — arregla el resalte “recortado” del hover.
13. ✅ **Refinamiento 4 — Ranking** (feedback del usuario): **cabecera en salmón** (título de la vacante +
    KPIs `CVs`/`Promedio`; tinta 7.73:1; rota a blanco en oscuro), **más separación** entre los componentes de
    cada dossier (escala completa: relleno y pozo →24, secciones 16→24, cabecera 16→24, aire título/sub
    restaurado) y **entre fichas** (`dossier-list` 12→16→**24px**: blanco real ≈19px con las sombras),
    **hover con color** (`--salmon-tint`) que se **suma** al lift/sombra de
    `.block--lift` (nada se borra), y arreglo a11y de **orden de encabezados** (`h3` título / `h4` secciones,
    Lighthouse a11y **100** con dossier expandido). Capturas `19`/`20`/`21`/`22`.
14. ✅ **Refinamiento 5 — Chat** (feedback del usuario): **selector de vacante en salmón sólido** (tinta
    **7.73:1**, chip de error contraste **6.42**) y **`#chat-log` con marco sólido** (`--line-w`) que separa la
    conversación del panel. En oscuro: barra → **blanco** (19.68), marco → **salmón**. Lighthouse a11y **100**
    (claro y oscuro). Capturas `23`/`24`.
15. ✅ **Refinamiento 6 — Footer** (feedback del usuario): **cierre documental** = el negativo de la navbar
    (banda `--ink` + regla superior `--paper`; en oscuro **salmón**/negro 7.73:1) a la derecha de la columna
    (`margin-left: var(--sidebar-w)`, reseteo ≤900px). Contenido: marca + empresa + nota de demo, **atajos**
    a las 3 vistas con hover de **sello invertido** (papel/negro ⇄ negro/salmón), créditos técnicos y la nota
    de **revisión humana**. Foco papel sobre la banda. Lighthouse a11y **100** (claro y oscuro).
    Capturas `25`/`26`.
    **Fix (feedback):** en la vista **Vacantes** el footer quedaba flotando (la vista es corta, 481px vs 900px
    de viewport → 191px de hueco). Causa: `body` bloque, el footer colgaba del contenido. Solución: *sticky
    footer* — `body { display:flex; flex-direction:column; min-height:100vh }` + `.content { flex:1 0 auto }`
    (el contenido crece y empuja la banda al fondo; orden visual intacto: masthead · sidebar · content ·
    footer). Verificado en claro y oscuro, ≤900px y páginas largas (0px de hueco, sin overflow). Capturas
    `27`/`28`.
    **`6b` — versión discreta (feedback: “muy vistoso y grueso”):** regla superior **4px→2px**; padding
    16/24→**8/16**; marca **apilada→en línea**; créditos en **una línea** (antes columna de 2); nota a ancho
    completo en **una línea** (antes 52ch forzaba wrap en 2); hover **chip→subrayado 2px**. Alto:
    164 → 128 → **66px**. Contraste intacto (19.33 claro / 7.73 oscuro), pegado al fondo, Lighthouse a11y
    **100** (claro y oscuro). Capturas `29`/`30`.
16. ⬜ Pulido fino: wordmark + ilustración de estado vacío (`canvas-design`).
17. ✅ **Limpieza + refactor (Fases 1–2)**: auditoría de código muerto y prolijidad de todo el frontend.
    Sin cambios visuales ni de comportamiento. Detalle en *§10 → Limpieza*.

**Estado actual:** las 3 vistas están construidas con la **dirección BRUTALISMO aplicada** y verificadas
(Chrome real sobre datos reales + estilos computados + muestreo de paleta + contraste WCAG + Lighthouse).
Se sirven en `http://localhost:3000/app/` (el backend monta `express.static` sobre `frontend/`).
Deep-linking: `#vacantes` · `#ranking` · `#chat`. Capturas en `docs/capturas/`.

---

## 10. Pendientes / decisiones abiertas

- **⚠️ Tensión con la consigna:** la *plantilla* del curso pedía **“glassmorphism extremo”** (lo opuesto al
  brutalismo). Se decidió **priorizar el pedido explícito del usuario (brutalismo blanco/negro/salmón)**.
  Conviene **mencionarlo en la presentación** (o conservar capturas de la versión “vidrio” como paso previo).
- **Fuentes**: **decididas — Archivo Black (display) + Space Grotesk (titulares/UI) + Instrument Sans
  (cuerpo) + Space Mono (etiquetas/datos)**, self-hosted. Fraunces / JetBrains Mono / Bricolage / Plus
  Jakarta / Inter quedan declaradas en `fonts.css` (inertes) por si se retoman.
- **Paleta**: **decidida — `#FFFDF5` / `#0B0B0B` / `#FF7A6B`**. El salmón es el único acento; el rojo
  `#B3261E` es **funcional** (solo error). Se puede subir/bajar la “marcadez” ajustando dónde se pinta el
  salmón (hoy: navbar + botones + sellos + resaltador + burbuja del usuario + **cabecera del tablero de
  Vacantes** + **cabecera del Ranking** + **selector de vacante del Chat**). **No se agrega un 4º color**
  (se evaluó y se descartó: se prioriza **subir el negro** y el **grosor del punto**).
- **Fondo**: **decidido — papel plano + malla de puntos negros + grano tenue**. Grilla y roseta
  **descartadas** (y borradas). Grosor del punto subido (radio `1.65px`, opacidad `.38` claro / `.48` oscuro).
- **Lista de vacantes (Opción C)**: filas con **regla gruesa** en lugar de cajas dentro del panel; aire
  **relativo** (`padding-block: .75rem` ≈ 28px). Las fichas de **Ranking** siguen siendo cajas.
- **Piso micro tipográfico**: `--fs-micro` (.8125rem) / `--fs-micro-2` (.75rem) + `--track-micro` (.06em).
- **Modo oscuro**: repurpuso el control de la etapa “vidrio” (“Disminuir transparencia” → **“Modo oscuro”**),
  persistido en `localStorage` (`cvlight.theme`). **Retoque de identidad**: los tres colores **rotan de rol**
  (salmón → blanco · blanco → negro · negro → salmón) — navbar/botones/sellos **blancos**, superficies
  **negras**, tinta y trazo **salmón**, sombra salmón (sigue a `--line`). Neutros cálidos para la jerarquía
  secundaria, foco = acento (blanco) y anillo de tinta dentro de la navbar. Capturas `16`/`17`/`18`
   (y `19`–`22` para el Ranking, `23`/`24` para el Chat, `25`/`26` para el Footer, `27`/`28` para el
   Footer fijo en Vacantes, `29`/`30` para el Footer discreto).
- **Renombre**: ✅ **hecho** — “ReclutIA → CVlight” aplicado en los docs heredados
  (`DOCUMENTO - CVlight.md`, `PLAN - Proyecto CVlight.md`). La empresa queda **Talento Humano S.A.**
- **Limpieza + refactor**: ✅ **hecho (Fases 1–2)**, sin cambios visuales ni de comportamiento.
  **Fase 1 — código muerto:** borrados `css/style-variants.css` (180 líneas, nunca linkeado) y
  `frontend/stitch_glassmorphic_modern_dashboard.zip` (811 KB); **5 familias de fuente inertes** + sus
  licencias (Bricolage, Plus Jakarta, Inter, JetBrains Mono, Fraunces — quedan las 4 en uso: Archivo Black,
  Space Grotesk, Instrument Sans, Space Mono); tokens sin uso en `tokens.css` (`--radius-frame/well/chip`,
  `--track`, `--mark`, `--line-2`, `--bg-base`, `--accent`, `--accent-ink`, `--step-display`, `--s7`);
  clases muertas en `base.css` (`.display`, `.mono`, `.label`, `.tnum`, `.score`) y en `blocks.css`
  (`.block--strong/partial/weak`, módulo `.stamp*`); JS sin llamadores (`CV.util.el`, `CV.a11y.announce`,
  `CV.api.getJob`, `CV.views.vacantes.select`); clase huérfana `.panel-loading`; comentario obsoleto en
  `views.css`. **Fase 2 — prolijidad:** estilos inline estáticos de los templates → reglas CSS
  (`.job-detail .chips`, `.chat-wrap .toolbar .status.error`, `.suggestions`, `.empty .btn-row`);
  duplicados extraídos a `CV.util` (`resolveJob`, `jobOption`, `emptyBox`); rename `.transparency` →
  `.theme-toggle` (nombre heredado de la etapa “vidrio”); guard de carrera en `loadRanking()` (no pinta si
  se cambió de vacante durante el `fetch`); reglas `.chev` consolidadas; contrato de vista
  (`mount`/`onShow`) documentado en `app.js`. Verificado: `node --check` OK, sin errores de consola, 3
  vistas × 2 temas, sin overflow horizontal y Lighthouse a11y **100** (claro y oscuro). Sin capturas nuevas
  (no hay cambio visual).
