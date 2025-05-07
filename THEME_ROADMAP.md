# 🖌️ Theming & Colour Architecture Road-map

This document describes **where colours live today**, **why** we want a proper theming system, and **how** to implement it step-by-step.  The end-goal is to support multiple colour schemes (e.g. a neon *Cyber-punk* palette) without rewriting templates or JavaScript.

---

## 1&nbsp;·&nbsp;Current colour sources

| Area | File | Notes |
|------|------|-------|
| Base CSS framework | Pico.css (CDN) | Exposes `--pico-*` variables; mostly untouched. |
| Palette file | **`static/theme.css`** | Defines neutrals & semantic accents via CSS variables. |
| Inline styles | `<style>` block in **`templates/index.html`** | References variables from `theme.css`. |
| Chart colours | **`static/script.js`** | Hard-coded RGBA strings – the only place *not* driven by CSS vars. |

---

## 2&nbsp;·&nbsp;Why introduce a theme layer?

1. Single-point control of all branding / mood changes.
2. Ability to ship several themes or user-toggles without code duplication.
3. Charts & UI components pick up new colours automatically once bound to variables.

---

## 3&nbsp;·&nbsp;Minimal theme architecture

### 3.1 Promote every colour to a CSS variable

Add the missing variables (mainly chart series) to **`static/theme.css`**:

```css
:root {
  /* existing props … */

  /* charts */
  --c-series-1: #2d88ff; /* primary bar/line */
  --c-series-2: #ff6384; /* secondary bar/line */
  --c-grid    : rgba(255,255,255,.10);
}
```

### 3.2 Refactor Chart.js to consume the variables

Create a helper in **`static/script.js`**:

```js
function cssVar(name, alpha) {
  const raw = getComputedStyle(document.documentElement)
               .getPropertyValue(name).trim();
  if (alpha == null) return raw;               // solid colour
  return raw.replace(')', `,${alpha})`);        // crude opacity injection
}

const SERIES1 = cssVar('--c-series-1');
const SERIES1_70 = cssVar('--c-series-1', 0.7);
```

Use `SERIES1` / `SERIES1_70` wherever colours are currently hard-coded.

### 3.3 Add additional theme files

```
static/themes/
  ├─ dark.css        ← today’s palette (could simply `@import "../theme.css"`)
  ├─ cyberpunk.css   ← neon scheme (example below)
  └─ …future.css
```

Example `cyberpunk.css` (only overrides – keep file small!):

```css
/* --- CYBERPUNK -------------------------------------------- */
:root[data-theme='cyberpunk'] {
  /* neutrals */
  --c-bg-dark:    #0d0221;
  --c-bg-card:    #1d0447;
  --c-fg-text:    #f5f5f5;
  --c-border-card:#3a0ca3;
  --c-text-muted: #7a70b6;

  /* neon accents */
  --c-accent-good:    #00ff9f;
  --c-accent-warn:    #ffcc00;
  --c-accent-error:   #ff076e;
  --c-accent-info:    #00e5ff;
  --c-accent-neutral: #9d00ff;

  /* charts */
  --c-series-1: #00e5ff;
  --c-series-2: #ff007f;
  --c-grid    : rgba(255,255,255,.15);

  /* Optional Pico mappings */
  --primary:   var(--c-accent-info);
  --secondary: var(--c-accent-neutral);
  --background:var(--c-bg-dark);
  --surface:   var(--c-bg-card);
  --contrast:  var(--c-fg-text);
}
```

### 3.4 Light-weight theme switcher

```html
<!-- in <head> (templates/index.html) -->
<link id="themeStyles" rel="stylesheet"
      href="{{ url_for('static', filename='themes/dark.css') }}">

<script>
  function setTheme(name) {
    document.documentElement.dataset.theme = name;
    document.getElementById('themeStyles').href = `/static/themes/${name}.css`;
    // TODO: if Chart instances are cached, trigger a redraw here.
  }
</script>
```

Expose this via a dropdown, keyboard shortcut, or `?theme=cyberpunk` URL param.

---

## 4&nbsp;·&nbsp;Chart.js neon touches

Tips for a convincing synthwave look:

* Transparent chart background (already done).
* Bright border colours with semi-transparent fills.
* `shadowBlur` plug-in to add subtle glow (optional).

Example dataset config:

```js
datasets: [{
  label: 'Load Time',
  data: durations,
  borderColor: cssVar('--c-series-1'),
  backgroundColor: cssVar('--c-series-1', .25),
  borderWidth: 2,
}]
```

---

## 5&nbsp;·&nbsp;Roll-out checklist

- Current progress is tracked below.  **Phase&nbsp;1 is now complete!**

### ✅ Phase&nbsp;1 — Variable extraction (completed)

* [x] Promote hard-coded chart colours in `static/script.js` to CSS variables.
* [x] Add `--c-series-*` & `--c-grid` to `static/theme.css`.
* [x] Introduce `cssVar` / `cssVarAlpha` helpers & rewrite Chart configs.

### ✅ Phase&nbsp;2 — Theme files & switcher (completed)

* [ ] Create `static/themes/dark.css` (imports current palette).
* [x] Create `static/themes/dark.css` (imports current palette).
* [x] Create `static/themes/cyberpunk.css` (overrides variables).
* [x] Inject `<link id="themeStyles">` + `setTheme()` helper in `templates/index.html`.
* [x] Provide UI control **and** `?theme=` param to select theme.

All core switching mechanics are now operational.  Charts will still display
previous colours until they are rebuilt after a theme change – addressed in
Phase&nbsp;3.

### ⏭️ Phase&nbsp;3 — Runtime refresh

* [ ] Redraw / update Chart.js instances when theme changes.

### ⏭️ Phase&nbsp;4 — Documentation

* [ ] Document variables & theming guide in **README.md**.

---

## 6&nbsp;·&nbsp;Colour inspiration – Cyber-punk

| Swatch | Hex | Role |
|--------|-----|------|
| ![#00e5ff](https://via.placeholder.com/15/00e5ff/000000?text=+) | `#00e5ff` | Primary / Info |
| ![#ff007f](https://via.placeholder.com/15/ff007f/000000?text=+) | `#ff007f` | Secondary |
| ![#00ff9f](https://via.placeholder.com/15/00ff9f/000000?text=+) | `#00ff9f` | Success |
| ![#ffcc00](https://via.placeholder.com/15/ffcc00/000000?text=+) | `#ffcc00` | Warning |
| ![#ff076e](https://via.placeholder.com/15/ff076e/000000?text=+) | `#ff076e` | Error |

Pair bright neons with very dark backdrops (`#05040f` – `#0d0221`) and high contrast text.

---

### Happy theming! ✨
