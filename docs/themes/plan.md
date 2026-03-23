# Sero Theme System — Implementation Plan

## Executive Summary

Sero already has a solid foundation for theming: CSS custom properties in `globals.css`
(two colour modes), a `dark` class toggle via Zustand, and layout persistence through
IPC. However, ~36 component files still use hardcoded Tailwind colour classes
(e.g. `text-emerald-400`, `bg-red-500`) that bypass the design-system variables,
making full re-skinning impossible without touching every file.

This plan introduces a **semantic token layer**, a **theme preset system** with
import/export, and a **Theme Panel UI** — while keeping the existing light/dark
toggle working throughout.

---

## Current State Audit

### What already works

| Layer | Status |
|-------|--------|
| CSS custom properties (`:root` / `.dark`) | ~50 variables in `packages/ui/src/styles/globals.css` |
| `dark` class toggle on `<html>` | `applyTheme()` in `src/stores/app.ts` |
| Theme persisted to `layout.json` | Via `persistLayout({ theme })` — 4-layer IPC |
| shadcn/ui variables (oklch-based) | Full light + dark sets |
| Federated apps (e.g. todo) | Already fall back to `var(--bg-base)` etc. |

### What needs work

| Issue | Scope |
|-------|-------|
| **36 files** use hardcoded Tailwind colour classes | 122 occurrences of `text-red-400`, `bg-emerald-500`, `bg-blue-500`, etc. |
| `TerminalPanel.tsx` has 48 hardcoded ANSI hex colours | Separate light/dark palettes |
| `ModelSelector.tsx` has 2 hardcoded gradient strings | Inline `style` attributes |
| `CodingWorkspace.tsx` has `bg-[#0a0a0b]` | Should use `var(--bg-base)` |
| No font/spacing/radius customisation | All hardcoded in CSS or Tailwind defaults |
| No theme preset storage, export, or sharing | `layout.json` only stores `"dark"` or `"light"` |
| No theme UI panel | Toggle exists in store but no settings surface |
| App-runtime has no theme context | Federated apps can't programmatically read the theme |

---

## Architecture

### Design Principles

1. **CSS variables are the single source of truth** — components never use
   hardcoded colours; everything flows through `var(--token)`.
2. **Themes are data, not code** — a theme is a JSON object mapping token names
   to values. No `.css` files per theme.
3. **Light/dark is a mode, not a theme** — every theme preset contains _both_
   a light and a dark palette. The mode toggle switches between them.
4. **Semantic over raw** — components use intent-based tokens (`--status-error`,
   `--accent-hover`) not palette positions (`--red-400`).
5. **Federated apps inherit by default, override by choice** — the host injects
   CSS variables on `:root`; apps read them automatically. Apps can scope
   overrides under their own container selector.

### Token Hierarchy

```
┌─────────────────────────────────────────────┐
│  Theme Preset (JSON)                        │
│  ┌────────────────────┐                     │
│  │ palette (raw)      │  colours, fonts,    │
│  │                    │  spacing, radius    │
│  └────────┬───────────┘                     │
│           ↓ maps to                         │
│  ┌────────────────────┐                     │
│  │ semantic tokens    │  --bg-base,         │
│  │                    │  --status-error,    │
│  │                    │  --accent-hover,    │
│  │                    │  --font-sans, etc.  │
│  └────────┬───────────┘                     │
│           ↓ injected as                     │
│  ┌────────────────────┐                     │
│  │ CSS custom props   │  :root { ... }      │
│  │ on <html>          │                     │
│  └────────────────────┘                     │
└─────────────────────────────────────────────┘
```

### Theme Preset Shape

```typescript
interface ThemePreset {
  /** Unique ID (uuid or slug). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Author (for shared presets). */
  author?: string;
  /** Schema version for forward compat. */
  version: 1;

  /** Colour tokens — both modes required. */
  colors: {
    light: ColorTokens;
    dark: ColorTokens;
  };

  /** Typography overrides (optional — falls back to defaults). */
  typography?: {
    fontSans?: string;      // e.g. "Inter, system-ui, sans-serif"
    fontMono?: string;      // e.g. "JetBrains Mono, monospace"
    fontSizeBase?: string;  // e.g. "14px"
  };

  /** Spacing scale overrides (optional). */
  spacing?: {
    xs?: string;
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
  };

  /** Border radius overrides (optional). */
  radius?: {
    sm?: string;
    md?: string;
    lg?: string;
  };
}

interface ColorTokens {
  // Surfaces
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgOverlay: string;
  bgMuted: string;

  // Borders
  borderSubtle: string;
  borderDefault: string;
  borderFocus: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Accent
  accentPrimary: string;
  accentHover: string;
  accentMuted: string;
  accentCode: string;

  // Status (semantic)
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  statusInfo: string;

  // Terminal ANSI (optional — falls back to defaults derived from status colours)
  terminal?: Partial<TerminalColorTokens>;
}
```

### Storage

```
~/.sero-ui/
├── layout.json                 # existing — adds activeThemeId field
└── themes/
    ├── builtin/                # shipped with app, read-only
    │   ├── default.json
    │   ├── solarized.json
    │   └── nord.json
    └── custom/                 # user-created or imported
        ├── my-theme.json
        └── imported-theme.json
```

- **Built-in themes** are bundled in the app resources and copied to
  `builtin/` on first launch (or version upgrade).
- **Custom themes** are created via the Theme Panel or imported from `.json` files.
- Theme files are plain JSON matching the `ThemePreset` interface above.

---

## Implementation Phases

### Phase 1 — Semantic Token Migration (no UI changes)

**Goal:** Replace all hardcoded Tailwind colour classes with CSS variable
equivalents so that changing variables actually re-skins the entire app.

#### 1a. Extend CSS custom properties

Add new semantic tokens to `packages/ui/src/styles/globals.css` for the colours
currently referenced only via Tailwind classes:

```css
:root {
  /* existing tokens stay unchanged */

  /* NEW — semantic status variants for component use */
  --status-success-muted: #16a34a1a;   /* success at 10% opacity */
  --status-error-muted: #dc26261a;
  --status-warning-muted: #d977061a;
  --status-info-muted: #2563eb1a;

  /* NEW — interactive */
  --interactive-primary: #2563eb;       /* blue buttons */
  --interactive-primary-hover: #1d4ed8;
  --interactive-danger: #dc2626;
  --interactive-danger-hover: #b91c1c;

  /* NEW — semantic indicator colours */
  --indicator-active: #22c55e;          /* replaces emerald-500 */
  --indicator-recording: #ef4444;       /* replaces red-500 */
  --indicator-thinking: #f59e0b;        /* replaces amber-500 */
}

.dark {
  --status-success-muted: #22c55e1a;
  --status-error-muted: #ef44441a;
  /* ... dark variants ... */
}
```

#### 1b. Migrate components (36 files, ~122 replacements)

For each file, replace Tailwind colour classes with `var()` equivalents:

| Before | After |
|--------|-------|
| `text-emerald-400` | `text-[var(--status-success)]` |
| `bg-red-500/15` | `bg-[var(--status-error-muted)]` |
| `bg-blue-500 text-white hover:bg-blue-600` | `bg-[var(--interactive-primary)] text-[var(--text-inverse)] hover:bg-[var(--interactive-primary-hover)]` |
| `border-red-500/20` | `border-[var(--status-error-muted)]` |
| `dark:text-emerald-400` | _(remove — variable handles mode)_ |

**Key insight:** Many existing patterns use `dark:text-xxx` alongside the light
variant. After migration, the `dark:` prefix is unnecessary because the CSS
variable already changes value under `.dark`. This _simplifies_ the markup.

**Approach per file:**
1. Audit every colour class
2. Map to the closest semantic token
3. Remove redundant `dark:` colour overrides
4. Verify visually in both modes

**Priority order** (highest-traffic components first):
1. `ToolCallHelpers.tsx` — status colours throughout
2. `ChatPromptArea.tsx` — button and input states
3. `ActivityBar.tsx` — active indicators
4. `MainSidebar.tsx` — section colours
5. `StatusBar.tsx` — status indicators
6. `SessionBadge.tsx` — progress colours
7. Remaining 30 files

#### 1c. Fix hardcoded hex values

| File | Fix |
|------|-----|
| `CodingWorkspace.tsx` | `bg-[#0a0a0b]` → `bg-[var(--bg-base)]` |
| `ModelSelector.tsx` | Extract gradient tokens `--gradient-thinking-high`, `--gradient-thinking-low` |
| `TerminalPanel.tsx` | Map ANSI palette to `--terminal-*` tokens with light/dark defaults |

#### 1d. Derive shadcn variables from Sero tokens

Currently `globals.css` has _two independent_ variable sets: the Sero design
system (`--bg-base`, etc.) and shadcn's oklch set (`--background`,
`--foreground`, etc.). These should be unified so a theme change affects both.

Options (decide during implementation):
- **Option A:** Map shadcn vars to Sero tokens: `--background: var(--bg-base)`
- **Option B:** Replace Sero tokens with shadcn naming and extend shadcn's set

Option A is safer since 38+ files already use `var(--bg-base)` etc.

---

### Phase 2 — Theme Preset Engine

**Goal:** Load, apply, create, and persist theme presets.

#### 2a. Theme types (`src/types/theme.ts`)

Define `ThemePreset`, `ColorTokens`, `TerminalColorTokens` as above.
Include a `DEFAULT_THEME: ThemePreset` constant matching current `globals.css` values.

#### 2b. Theme application logic (`src/lib/theme-engine.ts`)

```typescript
/**
 * Given a ThemePreset and the current mode ('light' | 'dark'),
 * inject all CSS custom properties onto document.documentElement.
 */
export function applyThemePreset(preset: ThemePreset, mode: 'light' | 'dark'): void;

/**
 * Reset to built-in default (remove all inline style overrides).
 */
export function resetTheme(): void;

/**
 * Validate a ThemePreset (for import safety).
 */
export function validateThemePreset(data: unknown): ThemePreset | null;

/**
 * Generate a minimal CSS string for the theme (for export/sharing).
 */
export function themeToCSS(preset: ThemePreset): string;
```

**How it works:**
- `applyThemePreset` iterates over the preset's tokens and calls
  `document.documentElement.style.setProperty('--bg-base', value)` for each.
- The existing `.dark` / `:root` rules in `globals.css` serve as the _default_
  theme. Custom themes override specific properties via inline styles on `<html>`.
- `resetTheme()` removes all inline style overrides, reverting to `globals.css`.

#### 2c. Theme file IPC (`electron/ipc/themes.ts`)

New IPC domain: `window.sero.themes.*`

```typescript
interface ThemeIPC {
  /** List all available theme presets (built-in + custom). */
  list(): Promise<ThemePresetMeta[]>;
  /** Load a specific theme preset by ID. */
  load(id: string): Promise<ThemePreset>;
  /** Save a custom theme preset (create or update). */
  save(preset: ThemePreset): Promise<void>;
  /** Delete a custom theme preset. */
  delete(id: string): Promise<void>;
  /** Import a theme from a file path (user selects via dialog). */
  import(): Promise<ThemePreset | null>;
  /** Export a theme to a file path (save dialog). */
  export(id: string): Promise<boolean>;
}
```

**Implementation:**
- Register in `electron/ipc/index.ts` alongside other handlers
- Add to preload bridge in `electron/preload.ts`
- Type in `src/types/electron.d.ts`
- Themes stored at `SERO_HOME/themes/{builtin,custom}/`

#### 2d. Theme store (`src/stores/theme.ts`)

Dedicated Zustand store (keeps `app.ts` under 500 LOC):

```typescript
interface ThemeStoreState {
  /** All available presets (metadata only — full load is lazy). */
  presets: ThemePresetMeta[];
  /** Currently active preset ID. */
  activePresetId: string;
  /** Currently active mode within the preset. */
  mode: 'light' | 'dark';
  /** The fully loaded active preset. */
  activePreset: ThemePreset | null;

  // Actions
  loadPresets(): Promise<void>;
  setPreset(id: string): Promise<void>;
  setMode(mode: 'light' | 'dark'): void;
  toggleMode(): void;
  saveCustomPreset(preset: ThemePreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  importPreset(): Promise<ThemePreset | null>;
  exportPreset(id: string): Promise<boolean>;
}
```

- `setPreset` loads the full preset via IPC, calls `applyThemePreset()`,
  persists `activeThemeId` to `layout.json`.
- `toggleMode` replaces the current `toggleTheme` in `app.ts`.
- On startup, `loadPresets()` is called alongside `loadLayout()`.

#### 2e. Migrate existing theme state

- `layout.json` gains `activeThemeId?: string` (defaults to `'default'`).
- The existing `theme?: string` field is renamed to `themeMode?: 'light' | 'dark'`
  for clarity (with backward compat: if `theme` is found, treat as `themeMode`).
- `app.ts` delegates theme logic to `theme.ts` store — `setTheme()` and
  `toggleTheme()` become thin wrappers that call `useThemeStore.toggleMode()`.

---

### Phase 3 — Theme Panel UI

**Goal:** A polished settings panel where users can browse, customise, create,
import/export, and share theme presets.

#### 3a. Theme Panel component (`src/components/layout/ThemePanel.tsx`)

Accessible from:
- A "Theme" button in the TitleBar (or via Command Menu ⌘K → "Theme")
- Opens as a **slide-over panel** (similar to how ChatPanel works) or a **dialog**

**Sections:**

1. **Mode toggle** — Light / Dark / System (adds system-preference detection)
2. **Preset browser** — grid of preset cards with live preview thumbnails
3. **Customise** — colour pickers for each token group:
   - Surfaces (bg-base, bg-surface, bg-elevated, bg-overlay, bg-muted)
   - Text (primary, secondary, muted, inverse)
   - Accent (primary, hover, muted, code)
   - Status (success, warning, error, info)
   - Terminal palette
4. **Typography** — font family pickers, base font size slider
5. **Spacing & Radius** — sliders for spacing scale and border radius
6. **Preset management** — Save as new preset, rename, delete
7. **Import/Export** — import `.json` file, export current, copy shareable JSON

#### 3b. Live preview

Changes are applied in real-time as the user adjusts controls (via
`document.documentElement.style.setProperty`). A "Reset" button reverts to the
last saved state. "Save" persists to disk.

#### 3c. System theme detection

Add `prefers-color-scheme` media query listener:
- When mode is "system", watch for OS theme changes and call `setMode()` accordingly.
- Store the preference as `themeMode: 'light' | 'dark' | 'system'` in layout.

#### 3d. Command Menu integration

Register theme commands in the ⌘K command menu:
- "Switch to Light Mode"
- "Switch to Dark Mode"
- "Open Theme Panel"
- "Reset Theme to Default"

---

### Phase 4 — Federated App Theme Integration

**Goal:** Sero apps automatically inherit the theme and can programmatically
access theme tokens.

#### 4a. Extend `AppContextValue`

```typescript
interface AppContextValue {
  // existing fields...

  /** Current theme mode. */
  themeMode: 'light' | 'dark';
  /** Active theme preset ID. */
  themePresetId: string;
}
```

Apps that need to react to theme changes can use this. Most apps won't need
it — they just use CSS variables which update automatically.

#### 4b. Add `useTheme` hook to `@sero-ai/app-runtime`

```typescript
export function useTheme(): {
  mode: 'light' | 'dark';
  presetId: string;
};
```

Simple hook that reads from the app context. For advanced use cases
(e.g. canvas-based rendering, charts), apps can read the current CSS variable
values programmatically.

#### 4c. App theme scoping

Apps that need custom colours can scope overrides:

```css
[data-app="my-app"] {
  --accent-primary: #e11d48;  /* rose instead of indigo */
}
```

The host's `SeroAppMount` component already wraps apps in a container — add a
`data-app` attribute so apps can use it as a scoping selector.

---

### Phase 5 — Built-in Presets & Polish

#### 5a. Ship built-in presets

Create 4-6 built-in theme presets:

| Preset | Style |
|--------|-------|
| **Default** | Current Sero colours (dark zinc, indigo accent) |
| **Solarized** | Ethan Schoonover's Solarized palette |
| **Nord** | Arctic colour scheme |
| **Catppuccin** | Pastel theme (Mocha/Latte variants) |
| **Rosé Pine** | Muted warm tones |
| **High Contrast** | Accessibility-focused, maximum contrast |

#### 5b. Theme sharing

- Export: theme → JSON file or clipboard (base64-encoded URL-safe string)
- Import: paste JSON or select file
- Future: optional Sero theme gallery (out of scope for v1)

#### 5c. Accessibility

- Ensure all built-in presets meet WCAG AA contrast ratios
- Add contrast-ratio validation in the Theme Panel colour picker
- Warn users when custom colours have poor contrast

---

## File Inventory

### New files

| File | Purpose |
|------|---------|
| `src/types/theme.ts` | ThemePreset, ColorTokens, TerminalColorTokens types |
| `src/stores/theme.ts` | Theme Zustand store |
| `src/lib/theme-engine.ts` | Apply/reset/validate theme presets |
| `src/components/layout/ThemePanel.tsx` | Main theme panel UI |
| `src/components/layout/theme-panel/` | Sub-components (colour pickers, preset cards, etc.) |
| `electron/ipc/themes.ts` | Theme file CRUD IPC handlers |
| `packages/app-runtime/src/use-theme.ts` | `useTheme` hook for federated apps |

### Modified files

| File | Change |
|------|--------|
| `packages/ui/src/styles/globals.css` | Add semantic tokens, unify shadcn/sero vars |
| `src/stores/app.ts` | Delegate theme to theme store, keep backward compat |
| `src/types/layout.ts` | Add `activeThemeId`, rename `theme` → `themeMode` |
| `src/types/electron.d.ts` | Add `window.sero.themes.*` types |
| `electron/preload.ts` | Expose `themes` IPC domain |
| `electron/ipc/index.ts` | Register theme handlers |
| `packages/app-runtime/src/context.ts` | Add theme fields to `AppContextValue` |
| `packages/app-runtime/src/index.ts` | Export `useTheme` |
| **36 component files** | Replace hardcoded Tailwind colours with `var()` tokens |
| `TerminalPanel.tsx` | Replace ANSI hex map with `--terminal-*` tokens |
| `ModelSelector.tsx` | Replace gradient hex with tokens |
| `CodingWorkspace.tsx` | Replace `bg-[#0a0a0b]` |
| `TitleBar.tsx` or `CommandMenu.tsx` | Add theme panel trigger |

---

## Migration Strategy

### Rollout order

1. **Phase 1 first** — this is the foundation. Without token migration,
   custom themes would only partially re-skin the app.
2. **Phase 2 next** — the engine. Can be tested with manual JSON editing
   before any UI exists.
3. **Phase 3** — the UI. This is the visible payoff.
4. **Phase 4** — federated app integration. Can be done in parallel with Phase 3.
5. **Phase 5** — polish and presets. Done last.

### Backward compatibility

- Existing `layout.json` files with `theme: "dark"` continue to work.
  The loader treats missing `activeThemeId` as `"default"` and maps
  `theme` to `themeMode`.
- The `default` built-in preset produces _identical_ output to the
  current `globals.css`, so upgrading is invisible to users.
- Federated apps that already use `var(--bg-base)` etc. (like `pi-todo-extension`)
  need zero changes.

### Risk mitigation

| Risk | Mitigation |
|------|------------|
| 36-file migration introduces visual regressions | Screenshot comparison before/after, both modes |
| Shadcn/Sero variable unification breaks shadcn components | Option A (map shadcn → sero) is safe; test all shadcn primitives |
| Theme import allows malicious CSS injection | `validateThemePreset()` whitelists known token names, rejects arbitrary CSS |
| Performance of 50+ `setProperty` calls on theme switch | Batch inside `requestAnimationFrame`, negligible at this scale |
| Font changes break layout | Typography overrides are optional, defaults match current behaviour |

---

## Estimated Scope

| Phase | Files changed | New files | Complexity |
|-------|--------------|-----------|------------|
| Phase 1 — Token migration | ~40 | 0 | Medium (repetitive but careful) |
| Phase 2 — Preset engine | ~6 | 4 | Medium |
| Phase 3 — Theme panel UI | ~3 | 4-6 | High (UI/UX polish) |
| Phase 4 — App integration | ~4 | 1 | Low |
| Phase 5 — Presets & polish | ~2 | 4-6 (JSON) | Low-Medium |

---

## Open Questions

1. **Dialog vs slide-over panel?** The Theme Panel could be a modal dialog
   (simpler) or a slide-over like ChatPanel (more integrated). Recommend
   dialog for v1, with option to promote to panel later.

2. **System theme detection** — should "System" be the default mode for new
   installs, or keep defaulting to "Dark"?

3. **Granularity of typography controls** — should users be able to set
   different font sizes for different elements, or just a single base size
   with proportional scaling?

4. **Theme preset versioning** — should presets include a `seroVersion` field
   so we can warn about incompatibility with older/newer token sets?
