# Investigación — Dirección visual **“BRUTALISMO”** (CVlight)

> Parcial 2 — Proyecto de Inteligencia Artificial · Empresa: **Talento Humano S.A.** · App: **CVlight**
> Motivo: **refactor visual a neo-brutalismo** con **blanco / negro / salmón, muy marcado**.
> Se **descarta** la dirección anterior (“Expediente sobre vidrio”: glassmorphism + papel de seguridad con
> roseta guilloché y grilla) y se **elimina** el cuadriculado y la roseta del fondo.
> Este documento resume la investigación (referencias, librerías, componentes e inspiración) y **cómo se
> aplicó** cada hallazgo al proyecto. La verificación numérica está al final.

---

## 1. Qué es el neo-brutalismo

El **neo-brutalismo** (o *neubrutalism*, *anti-design*) es un movimiento de diseño de interfaces que
**rechaza la neutralidad pulida** en favor de la **brusquedad gráfica**: alto contraste, tipografía pesada,
**formas muy definidas** y estructura **conspicua** — sobre todo **contornos** y **sombras duras**.

- **Origen:** principios de los 2020 (web y UI). Es la versión **productizada** del *brutalismo web* crudo:
  conserva la energía rebelde, pero la traduce en una **gramática de interfaz repetible y usable**. El
  interfaz no desaparece: **se muestra**.
- **Diferencia clave:** el brutalismo original era tosco y anti-convencional a propósito; el
  **neo-brutalismo** mantiene affordances reales (los botones **parecen** botones, la navegación es
  predecible) para que el resultado sea **ruidoso pero navegable**.

> Cita guía (neubrutalism.com): *“traduce esa energía rebelde en una **gramática de interfaz comercialmente
> usable**… es menos ‘brutalismo verdadero en la web’ y más un **dialecto de anti-diseño productizado**.”*

---

## 2. Las tres reglas medibles (la base del CSS)

Fuente: *theplusaddons.com* (2026) — tres reglas con valores concretos:

| # | Regla | Valor típico |
|---|---|---|
| 1 | **Borde grueso y plano** | **2–5 px**, casi negro (`#000`) |
| 2 | **Sombra dura con desplazamiento y blur 0** | `box-shadow: 6px 6px 0 #000` |
| 3 | **Relleno plano y saturado** | 1 color por superficie (amarillo, lima, cian, **rosa/salmón**…) |

```css
/* sombra convencional (difusa) */
box-shadow: 0 4px 12px rgba(0,0,0,.12);
/* sombra neo-brutalista: fijate el 0 de blur */
box-shadow: 6px 6px 0 #000;
```

**La cuarta regla implícita:** **tipografía de impacto**. El peso y el tamaño hacen el trabajo que en otras
estéticas hace el degradado.

**Fórmula “broken but not random”:** asimetría en el **macro** (bloques, color), mecánica y repetible en el
**micro** (componentes, espaciados). La navegación se mantiene **predecible**.

---

## 3. Anatomía visual (qué mirar al construir)

- **Color:** paleta **corta y valiente (2–3 acentos)** + neutros. Nada de degradados. El color en **áreas
  grandes y planas**.
- **Forma:** esquinas **rectas** (`border-radius: 0`). El **trazo es el adorno**.
- **Estructura visible:** bordes, rejas, etiquetas, numeración; el “andamio” se deja a la vista.
- **Tipografía (pares recomendados por la investigación):**
  - **Display / impacto:** Archivo Black, Syne, Bebas Neue.
  - **Titulares / UI:** Space Grotesk, Plus Jakarta Sans.
  - **Cuerpo:** Inter, DM Sans (el cuerpo debe ser **aburrido a propósito**).
  - **Mono:** Space Mono, JetBrains Mono.
- **Interacción:** el elemento **“entra en su propia sombra”**.
  - *hover*: `translate(-2px,-2px)` + la sombra **crece**.
  - *active*: `translate(2px,2px)` + la sombra **desaparece**.

### Componentes canónicos (grammar a replicar)

```css
/* BOTÓN */
.btn { border:3px solid #000; background:#FF7A6B; color:#0B0B0B; border-radius:0;
       box-shadow:5px 5px 0 0 #000; transition:transform .09s, box-shadow .09s; }
.btn:hover  { transform:translate(-2px,-2px); box-shadow:8px 8px 0 0 #000; }
.btn:active { transform:translate(2px,2px);   box-shadow:none; }

/* TARJETA / PANEL */
.block { background:#fff; border:3px solid #000; border-radius:0; box-shadow:5px 5px 0 0 #000; }

/* POZO (superficie de lectura) */
.well { background:#FFFDF5; border:2px solid #000; border-radius:0; }

/* SELLO / CHIP */
.stamp { font-family:mono; text-transform:uppercase; letter-spacing:.08em;
         border:2px solid #000; border-radius:0; padding:3px 9px; }

/* TABS */
.tab[aria-selected="true"] { background:#0B0B0B; color:#FFFDF5; }   /* sello prensado */
```

---

## 4. Librerías y componentes (referencias para robar **patrones**)

| Recurso | Qué es | Por qué sirve |
|---|---|---|
| **[neobrutalism.dev](https://www.neobrutalism.dev/)** | Librería de **64 componentes**, charts y *star shapes* para **React + Tailwind v4** (sobre shadcn/ui + Base UI). | Referencia **canónica** de patrones: botón, card, input, badge, tabs, alert, dialog. |
| **[github.com/ekmas/neobrutalism-components](https://github.com/ekmas/neobrutalism-components)** | La colección de componentes neobrutalistas estilo Tailwind. | Ver el **código real** de cada variante y estados. |
| **Tailwind (utilidades)** | El patrón se expresa con `border-2` / `border-4` + `shadow-[4px_4px_0_0_#000]`. | `neobrutalism.dev` sirve ~200 utilidades `border-2/4` en producción. |
| **[neubrutalism.com](https://neubrutalism.com/)** | Guía "definitiva": definición, anatomía, tipografía, **historia**, **código**, accesibilidad, ecosistema. | La fuente más completa del *por qué* y del *cómo*. |
| **Awwwards / Godly / Land-book / Pinterest** | Galerías de inspiración. | Ver sitios reales y no sólo componentes. |

> **Decisión del proyecto:** **no instalamos** ninguna librería. Nuestro frontend es **vanilla JS + CSS, sin
> build** (`express.static` sirve `frontend/`); las librerías de la lista son **React + Tailwind**. Por eso
> **traducimos la gramática a CSS propio** (tokens + primitivas), que además mantiene la demo sin internet.

---

## 5. Accesibilidad en brutalismo (lo crítico)

El estilo tiene **tres trampas** y la investigación insiste en ellas:

1. **El foco se “traga”.** Un borde grueso oscurece el anillo de foco por defecto → hay que **declarar
   siempre** un `:focus-visible` visible y **contrastante**. En CVlight: anillo **negro** por defecto y
   **salmón** sobre elementos de relleno negro (así nunca se pierde).
2. **Contraste color/texto.** El punto débil es el texto sobre el acento. Medido: **negro sobre rosa fuerte
   = 7.93:1 (AAA)**; **negro sobre blanco = 21:1**. Regla: **nunca texto blanco sobre salmón** (falla).
3. **No color-only.** Las bandas de puntaje no pueden distinguirse **sólo** por color → siempre **color +
   etiqueta de texto + forma/trama**.

**Advertencia de uso (Nielsen Norman Group):** el neo-brutalismo **funciona mal en datos densos /
dashboards** y en contextos de confianza. Nuestra app **es** un tablero de RRHH denso → conclusión: usarlo
como **capa de marca** (shell, navbar, botones, sellos, tarjetas) y **calmar el interior** (bloques de
lectura blancos, cuerpo en tipografía neutra, jerarquía clara). Es decir: **expresión en el marco,
legibilidad en el contenido**. *(El pedido del usuario fue “muy marcado”: se llevó el contraste al máximo
posible **sin** comprometer AA.)*

*Justificación “anti-IA” que aporta la investigación:* a medida que la IA inunda la web de *layouts*
friccionless y “promedio de todo”, lo **visiblemente hecho a mano / con opinión** se lee como **señal
humana**. El brutalismo, bien hecho, es lo opuesto al *AI slop* (nada de mesh-gradients, glow ni Inter).

---

## 6. Inspiración (para la demo y las slides)

- **neobrutalism.dev** — el ejemplo “de manual” (botones, cards, alertas).
- **feastables.com** — uso en producción; en **superficies oscuras** la sombra pasa a **blanca**
  (`box-shadow: 6px 6px 0 #fff`) — lo replicamos en el **modo oscuro** de CVlight.
- **gumroad.com** — se cita como referencia estética (su home actual **no** sirve sombras duras → **no**
  confirmado en producción).
- **Figma — “Web design trends 2026”, trend 12: neo-brutalism / anti-design.**
- **NN/g — “Neobrutalism”** (advertencias UX y mejores prácticas).
- **Pinterest — “brutalist color palette”** (inspiración de paleta).

---

## 7. Cómo se aplicó a CVlight

**Paleta (3 colores + neutros + un rojo funcional).**

| Rol | Token | Hex | Uso |
|---|---|---|---|
| Papel | `--paper` | `#FFFDF5` | fondo de página (off-white) |
| Tarjeta | `--card` | `#FFFFFF` | superficies / bloques |
| Tinta | `--ink` | `#0B0B0B` | texto |
| Trazo | `--line` | `#000000` | bordes y **sombra dura** |
| **Salmón** | `--salmon` | `#FF7A6B` | **único acento**: navbar, botones, sellos, resaltador |
| Neutros | `--ink-2/-3`, `--paper-2`, `--line-2` | — | jerarquía |
| Error (funcional) | `--danger` | `#B3261E` | **sólo** estados de error |

**Trazos / sombras / forma.** `--line-w: 3px` (`2` fino, `4` grueso) · `--hard-sm: 3px 3px 0 0 #000`,
`--hard: 5px 5px 0 0 #000`, `--hard-lg: 8px 8px 0 0 #000` · `--radius-*: 0`.
**Modo oscuro:** `--line`/`--shadow-color` pasan a **blanco** (patrón de feastables).

**Tipografía (self-hosted, OFL).** **Archivo Black** (display de impacto) · **Space Grotesk** (titulares /
UI) · **Instrument Sans** (cuerpo calmado) · **Space Mono** (etiquetas y datos). Ver `assets/fonts/`.

**Aplicación por zona.**
- **Navbar** = bloque **salmón** a todo el ancho, borde inferior grueso + sombra dura; *wordmark* en Archivo
  Black.
- **Bloques** (`.block`) = tarjeta blanca con borde negro + sombra dura; **hover** levanta, **active** hunde.
- **Bandas de puntaje** = **sello negro** (Fuerte) / **salmón** (Parcial) / **blanco con trama diagonal**
  (Débil) + **etiqueta** y **barra de forma distinta** → nunca sólo color.
- **Chat** = burbuja del usuario **salmón**, del bot **blanca**; resaltador de la cita = **bloque salmón**.
- **Fondo** = papel **plano** + **malla de puntos negros** (retícula 20px; se quitó la grilla y la roseta);
  encima, un **grano** casi imperceptible.

**Verificación (medida, no “a ojo”).**
- **Contraste WCAG:** tinta/papel **19.3** (AAA) · **tinta/salmón 7.73 (AAA)** · tinta-2 **13.9** ·
  etiquetas **6.27 (AA)** · blanco/negro **21** · error **6.42 (AA)** · modo oscuro **7.2–19.7**.
- **Lighthouse:** **Accesibilidad 100**, Agentic browsing 100. (Los 2 fallos restantes son *localhost sin
  HTTPS* y un `<meta>`; **Best Practices 81** lo causa un **antivirus** que inyecta scripts por HTTP, no la
  app.)
- **Muestreo de píxeles (capturas):** paleta = papel + blanco + **salmón ≈ 7 %** + negro; navbar exacta
  `#FF7A6B`; sin scroll horizontal; responsive ≤900 px apila la columna con borde duro.

---

## 8. Fuentes

1. **neubrutalism.com** — *Neubrutalism: The definitive guide* (definición, anatomía, tipografía, código).
2. **neobrutalism.dev** + **github.com/ekmas/neobrutalism-components** — librería de componentes.
3. **theplusaddons.com/blog/neo-brutalism-web-design/** — las 3 reglas CSS + tabla de contraste WCAG.
4. **nngroup.com/articles/neobrutalism/** — mejores prácticas y advertencias de uso.
5. **figma.com/resource-library/web-design-trends/** — tendencia 12: neo-brutalism / anti-design.
6. **medium.com/@sepidy/how-can-i-design-in-the-neo-brutalism-style** — guía práctica.
7. **figma.com/colors/salmon-pink/** e **icolorpalette.com/salmon-color-palette/** — valores del salmón
   (`#FA8072`, `#FF91A4`, …).
8. **feastables.com** (caso en producción, sombras blancas en oscuro).
