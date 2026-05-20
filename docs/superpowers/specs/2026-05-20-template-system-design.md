# Template System Design

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Add a template + color customization system to the admin. Visitors see a different public layout depending on the active template. Colors are customizable via CSS custom properties stored in the database.

---

## 1. Data Layer

### New table: `site_settings`

```ts
site_settings:
  key   text PRIMARY KEY
  value text NOT NULL
  updated_at timestamp DEFAULT now()
```

Two rows used at launch:
- `active_template` → `"default"` | `"portal"`
- `theme_colors` → JSON: `{ primary, secondary, background, surface }`

### Default color values per template

| Variable       | Default (current)  | Portal             |
|----------------|--------------------|--------------------|
| `primary`      | `#1A4FA0`          | `#CC0000`          |
| `secondary`    | `#F58A2D`          | `#FF6600`          |
| `background`   | `#F9FAFB`          | `#F5F5F5`          |
| `surface`      | `#FFFFFF`          | `#FFFFFF`          |

---

## 2. Settings API

### `GET /api/settings`
Public endpoint. Returns `{ template, colors }`. Called server-side in the root layout for SSR injection.

### `GET /api/admin/settings`
Admin-only. Same response plus metadata.

### `PUT /api/admin/settings`
Body: `{ template?: string, colors?: { primary, secondary, background, surface } }`  
Validates colors as valid hex strings. Saves to DB.

---

## 3. CSS Variable Injection

In `app/layout.tsx`, fetch settings server-side and inject:

```html
<style>
  :root {
    --color-primary: #1A4FA0;
    --color-secondary: #F58A2D;
    --color-bg: #F9FAFB;
    --color-surface: #FFFFFF;
  }
</style>
```

A `data-template="default|portal"` attribute on `<body>` controls template-specific structural styles.

---

## 4. Templates

### Template: Default

Preserved from current design. Components use CSS variables for colors (replacing hardcoded Tailwind `brand-*` where needed). Layout: header (solid), main with 3-col post grid + right sidebar.

### Template: Portal

Inspired by Canaltech. Structural changes:

**Header (`PortalHeader`)**
- Row 1: Logo left, SearchBar right
- Row 2: Horizontal category navigation tabs (scrollable on mobile)
- Background uses `--color-primary`

**HomePage**
- Hero section: latest published post, full-width, image with dark overlay, title + excerpt + read-more button on top of image
- Editorial grid below: first post large (col-span-2), next 4 posts in 2-column grid
- No sidebar

**PostCard variants**
- `PostCardDefault`: current card style
- `PostCardPortal`: top accent bar (`--color-secondary`), tighter layout, bolder category label

**Footer**: same for both templates.

---

## 5. Admin UI — `/admin/aparencia`

### Template Selector
Two cards side by side:
- SVG thumbnail showing a simplified wireframe of each layout
- Template name + short description
- Selected state: ring + checkmark badge

### Color Customizer
Below the template selector, 4 color fields:
- Label + `<input type="color">` + hex text input (synced)
- "Restaurar padrão" link per color resets to template default
- Colors default to the active template's defaults when switching templates

### Save Button
`POST /api/admin/settings` on click. Toast on success/error.

---

## 6. File Map

| File | Action |
|------|--------|
| `drizzle/schema.ts` | Add `site_settings` table |
| `drizzle/db.ts` | No change |
| `lib/settings.ts` | `getSettings()`, `defaultColors(template)` helpers |
| `app/api/settings/route.ts` | Public GET |
| `app/api/admin/settings/route.ts` | Admin GET + PUT |
| `app/layout.tsx` | Fetch settings, inject `<style>` CSS vars + `data-template` on `<body>` |
| `app/(public)/layout.tsx` | Call `getSettings()` directly (server component), render PortalHeader or Header based on template |
| `components/layout/Header.tsx` | Use CSS vars, keep for Default |
| `components/layout/PortalHeader.tsx` | New — Portal header |
| `components/blog/PostCardPortal.tsx` | New — Portal-style card |
| `components/blog/HeroPost.tsx` | New — Hero section for Portal |
| `components/blog/EditorialGrid.tsx` | New — editorial grid layout |
| `app/(public)/page.tsx` | Conditionally render Default vs Portal layouts |
| `app/admin/aparencia/page.tsx` | New — template selector + color pickers |
| `app/admin/layout.tsx` | Add "Aparência" nav link |
| `drizzle/migrations/` | New migration for `site_settings` |

---

## 7. Out of Scope

- Per-post template overrides
- More than 2 templates
- Font family customization
- Admin area theming
