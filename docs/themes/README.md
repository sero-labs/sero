# Theme System

Sero's theme system lets users customise colours, typography, spacing, and
border radius across the entire app. Themes are JSON presets stored in the
user's home directory and applied at runtime via CSS custom properties.

## Architecture

```
packages/templates/themes/*.json     Source-of-truth for default presets
        ↓ ensureDefaultThemes()      Copied on first launch (skip existing)
~/.sero-ui/themes/*.json             User-owned copies — freely editable
        ↕ IPC (load/save/delete)
Theme Engine (theme-engine.ts)       Sets CSS vars on <html> as inline styles
        ↓
globals.css                          Sero tokens + shadcn bridge + Tailwind 4
        ↓
Components                           Read via var(--token-name) or TW utilities
```

### Key files

| File | Role |
|------|------|
| `packages/templates/themes/*.json` | Built-in preset templates |
| `apps/desktop/electron/profile/setup.ts` | `ensureDefaultThemes()` — copies templates to `~/.sero-ui/themes/` |
| `apps/desktop/electron/ipc/themes.ts` | IPC handlers: list, load, save, delete, import, export |
| `apps/desktop/src/lib/theme-engine.ts` | `applyThemePreset()`, `resetTheme()`, `validateThemePreset()` |
| `apps/desktop/src/lib/google-fonts.ts` | Google Fonts CDN loader (injects `<link>` tags) |
| `apps/desktop/src/stores/theme.ts` | Zustand store + `hydrateThemeStore()` |
| `apps/desktop/src/types/theme.ts` | `ThemePreset`, `ColorTokens`, defaults |
| `packages/ui/src/styles/globals.css` | Sero design tokens, shadcn bridge, `@theme inline` |
| `apps/desktop/src/components/layout/ThemeEditorSheet.tsx` | Live theme editor UI |
| `apps/desktop/src/components/layout/ThemePanel.tsx` | Preset browser dialog |

## Design Token Hierarchy

The app has **two token layers** that are bridged in CSS:

```
Sero design tokens          shadcn/ui tokens (bridged)
─────────────────           ──────────────────────────
--bg-base            →      --background
--bg-surface         →      --card, --sidebar
--bg-elevated        →      --popover, --secondary, --sidebar-accent
--bg-overlay         →      --accent (hover/selection bg)
--bg-muted           →      --muted
--text-primary       →      --foreground, --primary
--text-inverse       →      --primary-foreground
--text-muted         →      --muted-foreground
--border-default     →      --border
--border-subtle      →      --input, --sidebar-border
--border-focus       →      --ring, --sidebar-ring
--status-error       →      --destructive
--accent-primary     →      --sidebar-primary
```

**Sero tokens** are set by the theme engine via inline styles on `<html>`.
**shadcn tokens** are defined as `var()` references in `globals.css` and
automatically follow when Sero tokens change.

### Naming rules

| Use case | Token | Notes |
|----------|-------|-------|
| Brand accent colour | `--accent-primary` | Indigo by default. Used for active indicators, focus decorations, dots. |
| Hover/selection background | `--accent` | shadcn token. Maps to `--bg-overlay`. Do NOT use for brand colour. |
| Surface levels | `--bg-base` → `--bg-surface` → `--bg-elevated` → `--bg-overlay` → `--bg-muted` | Each step is progressively more prominent. |

### Derived tokens

The theme engine auto-generates opacity variants from base status/collab/voice/banner colours:

- `--status-success-muted` (10%), `-subtle` (15%), `-faint` (3%), `-border` (20%)
- Same pattern for `warning`, `error`, `info`, `collab-primary`, `voice-*`, `banner-primary`

These do **not** need to be defined in preset JSON — they're computed at apply time.

## Preset JSON Format

```jsonc
{
  "id": "my-theme",              // Unique slug or UUID (matches filename)
  "name": "My Theme",
  "description": "Optional description",
  "author": "Author Name",
  "version": 1,
  "builtin": true,               // true for default presets, omit for custom

  "colors": {
    "light": {
      "bgBase": "#ffffff",
      "bgSurface": "#f4f5f7",
      "bgElevated": "#eaecf0",
      "bgOverlay": "#dde0e6",
      "bgMuted": "#c8ccd4",
      "borderSubtle": "#d4d8e0",
      "borderDefault": "#bcc1cc",
      "borderFocus": "#6366f1",
      "textPrimary": "#0f1117",
      "textSecondary": "#3b4252",
      "textMuted": "#6b7280",
      "textInverse": "#fafafa",
      "accentPrimary": "#6366f1",
      "accentHover": "#818cf8",
      "accentMuted": "#6366f11a",
      "accentCode": "#7c3aed",
      "statusSuccess": "#16a34a",
      "statusWarning": "#d97706",
      "statusError": "#dc2626",
      "statusInfo": "#2563eb",
      "collabPrimary": "#7c3aed",
      "voiceRecording": "#f43f5e",
      "voiceProcessing": "#06b6d4",
      "bannerPrimary": "#6366f1"
    },
    "dark": { /* same keys, dark values */ }
  },

  // All below are optional — defaults from globals.css apply if omitted
  "typography": {
    "fontSans": "'Inter', system-ui, sans-serif",
    "fontMono": "'JetBrains Mono', Menlo, monospace",
    "fontSizeBase": "14px"
  },
  "spacing": { "md": "12px" },   // Controls Tailwind --spacing base unit
  "radius": { "md": "8px" }      // Controls Tailwind --radius base
}
```

### How spacing/radius map to Tailwind 4

Tailwind 4 uses single base variables:

- `--spacing` — base unit. `p-4` = `calc(var(--spacing) * 4)`. Default `0.25rem` (4px).
- `--radius` — base radius. `rounded-lg` = `var(--radius)`, `rounded-md` = `calc(var(--radius) - 2px)`.

The theme engine derives these from the preset's `spacing.md` and `radius.md`:

```
--spacing = spacing.md / 3    (so p-3 ≈ spacing.md)
--radius  = radius.md         (direct mapping)
```

## Fonts

Fonts are loaded from **Google Fonts CDN** on demand. When a font stack is
applied, `loadGoogleFont()` extracts the primary family name, looks it up
in `GOOGLE_FONT_MAP`, and injects a `<link>` stylesheet into `<head>`.

### CSP requirements

The Electron CSP (`electron/csp.ts`) must allow:

- `style-src`: `https://fonts.googleapis.com` (serves `@font-face` CSS)
- `font-src`: `https://fonts.gstatic.com` (serves `.woff2` files)

### Adding a new Google Font

1. Add the family to `GOOGLE_FONT_MAP` in `src/lib/google-fonts.ts`
2. Add a preset entry in `FontPicker.tsx` (`SANS_PRESETS` or `MONO_PRESETS`)
3. Verify it loads: `curl -s "https://fonts.googleapis.com/css2?family=Font+Name&display=swap" | head -5`

System fonts (Helvetica Neue, Menlo, etc.) don't need entries in the map —
they're used as-is without network requests.

## Persistence

| What | Where | Mechanism |
|------|-------|-----------|
| Theme presets | `~/.sero-ui/themes/{id}.json` | IPC `themes.save` / `themes.load` |
| Selected theme ID | `~/.sero-ui/agent/layout.json` → `activeThemeId` | `persistLayout({ activeThemeId })` |
| Theme mode | `~/.sero-ui/agent/layout.json` → `theme` | `persistLayout({ theme: mode })` |

On startup, `hydrateThemeStore(themeMode, activeThemeId)` reads both values
from layout state and applies the saved theme.

## Creating a New Preset

### Via the UI

1. Open the Theme Editor (⌘K → "Edit Current Theme", or sidebar gear icon)
2. Click **"+ New"** in the editor header
3. Edit colours, typography, and layout
4. Click **Save** — generates a UUID-based ID and writes to `~/.sero-ui/themes/`

### Via JSON

1. Create a JSON file following the format above
2. Place it in `~/.sero-ui/themes/` (filename must match `id` + `.json`)
3. Restart the app or use the import function

### Adding a new built-in preset

1. Create the JSON file in `packages/templates/themes/`
2. Set `"builtin": true` in the JSON
3. It will be copied to new installations on first launch
4. Existing users won't get it automatically (by design — `ensureDefaultThemes` skips existing files). To force-update, users delete their copy and restart.

## Component Guidelines

### DO

```tsx
// Use Sero design tokens for all styling
className="bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]"

// Use --accent-primary for brand accent colour
className="text-[var(--accent-primary)]"
className="bg-[var(--accent-primary)]"

// shadcn components work automatically (bridged tokens)
<CommandDialog />  // uses bg-popover → var(--bg-elevated)
```

### DON'T

```tsx
// ❌ Hardcoded colours
className="bg-zinc-900 text-white border-zinc-700"

// ❌ var(--accent) for brand colour (that's the shadcn hover bg)
className="text-[var(--accent)]"  // Use --accent-primary instead

// ❌ Undefined tokens
className="bg-[var(--bg-hover)]"   // Use --bg-elevated
className="bg-[var(--bg-raised)]"  // Use --bg-elevated
```

### Token quick reference

| Purpose | Token |
|---------|-------|
| Page background | `--bg-base` |
| Card / sidebar background | `--bg-surface` |
| Popover / dropdown background | `--bg-elevated` |
| Hover / selection highlight | `--bg-overlay` |
| Disabled / muted background | `--bg-muted` |
| Default border | `--border-default` |
| Subtle / inner border | `--border-subtle` |
| Focus ring / border | `--border-focus` |
| Primary text | `--text-primary` |
| Secondary text | `--text-secondary` |
| Muted / placeholder text | `--text-muted` |
| Inverted text (on solid bg) | `--text-inverse` |
| Brand accent (indigo) | `--accent-primary` |
| Code / syntax accent | `--accent-code` |
| Success | `--status-success` |
| Warning | `--status-warning` |
| Error | `--status-error` |
| Info | `--status-info` |
