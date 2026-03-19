# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/aidevhub/pages/<page-name>.md`.
> If that file exists, its rules override this Master file.
> If not, follow the rules below.

---

**Project:** AIDevHub  
**Last synced:** 2026-03-18  
**Source of truth:** `app-v2/src/styles/theme.css` + `app-v2/src/styles/ui.css`

---

## Direction

- Light-first, glassy surfaces, technical (developer tool) feel.
- Airy blue accents with a strong CTA blue; avoid flat pure-white panels.
- Dense information layout is OK, but keep typography crisp and scannable.

## Global Tokens

### Colors (CSS Variables)

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#B8DDFF` | `--color-primary` |
| Secondary | `#E6F3FF` | `--color-secondary` |
| CTA/Accent | `#2F6FED` | `--color-cta` |
| Background | `#F4F8FF` | `--color-background` |
| Text | `#0B1220` | `--color-text` |
| Danger | `#EF4444` | `--color-danger` |
| Warning | `#F59E0B` | `--color-warning` |

Additional tokens (derived / translucent):

- `--color-surface-0`, `--color-surface-1` (panels)
- `--color-border`, `--color-border-subtle`, `--color-border-strong`
- `--color-muted` (secondary text)

### Typography

- **Body:** IBM Plex Sans (with `Noto Sans SC` CJK fallback)
- **Mono / Headings:** JetBrains Mono

**CSS Import (keep consistent with `theme.css`):**

```css
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap");
```

### Spacing / Radius / Shadow / Motion

Tokens are defined in `theme.css`:

- Spacing: `--space-xs` / `--space-sm` / `--space-md` / `--space-lg` / `--space-xl` / `--space-2xl`
- Radius: `--radius-sm` / `--radius-md` / `--radius-lg`
- Shadows: `--shadow-sm` / `--shadow-md` / `--shadow-lg`
- Motion: `--dur-fast` / `--dur` / `--dur-slow` + `--ease-out` (respect `prefers-reduced-motion`)

## Component Contracts (CSS Classes)

The UI is built with "utility-ish" component classes (not a design library). Prefer reusing these classes.

Layout:

- Shell: `.ui-shell` (sidebar + main)
- Sidebar: `.ui-sidebar`, `.ui-nav`, `.ui-navItem`
- Main: `.ui-main`, `.ui-pageHeader`, `.ui-pageTitle`, `.ui-pageKicker`

Cards:

- `.ui-card` (default panel)
- `.ui-cardGrid` (12-col layout; cards span 6 columns by default)
- `.ui-kpiRow`, `.ui-kpi` (overview stats)

Buttons:

- Base: `.ui-btn`
- Primary: `.ui-btnPrimary`
- Danger: `.ui-btnDanger`
- Row layout: `.ui-btnRow`

Forms:

- Layout: `.ui-formGrid`, `.ui-field`, `.ui-fieldFull`
- Inputs: `.ui-input`, `.ui-textarea`, `.ui-select`
- Helper / errors: `.ui-help`, `.ui-error`
- Custom select: `.ui-selectRoot`, `.ui-selectBtn`, `.ui-selectMenu`, `.ui-selectOption`

Tables:

- Wrapper: `.ui-tableWrap`
- Table: `.ui-table`, `.ui-th`, `.ui-td`, `.ui-tr`

Dialogs:

- Overlay: `.ui-dialogOverlay`
- Dialog: `.ui-dialog`, `.ui-dialogHeader`, `.ui-dialogBody`, `.ui-dialogFooter`

Micro components:

- Pills: `.ui-pill`, `.ui-pillDot`, `.ui-pillDotOn`, `.ui-pillDotOff`
- Monospace: `.ui-code`

## Interaction Guidelines

- All file writes must follow `preview -> apply` (diff preview + explicit confirm) to keep trust high.
- Focus states must be visible (`:focus-visible` patterns are already in `ui.css`).
- Avoid layout-shifting hover effects; use subtle translate/opacity instead.

## Anti-Patterns

- Hidden focus states / keyboard traps
- Flat white screens without depth (use the translucent surfaces and borders)
- Overly decorative animations; keep motion purposeful and short
- Inconsistent icon sets (stick to the existing icon component)
