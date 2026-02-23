# PRD: App Store & Favourites for MainSidebar

**Status:** Draft
**Author:** Claude (AI)
**Date:** 2026-02-23

---

## 1. Problem Statement

The MainSidebar Apps section currently renders a flat list of **every** discovered
app. With 10+ apps already and the number growing, this creates several problems:

1. **Clutter** — Users see apps they never use (Tetris, Calculator) alongside
   daily-drivers (Notes, Plan Mode), making the sidebar noisy.
2. **No personalisation** — There's no way to control which apps appear or their
   order. Every user sees the same list.
3. **Poor iconography** — Icons use a hardcoded `ICON_MAP` that maps Lucide icon
   names to emoji. Most apps fall through to a generic 📦. The mapping is
   incomplete (only 6 entries) and aesthetically inconsistent.
4. **No metadata visibility** — The sidebar shows only a name and emoji. Users
   can't see what an app does without clicking into it. The `description`,
   `version`, and `scope` from each app's `package.json` are available but not
   surfaced.

## 2. Goal

Replace the flat "all apps" list with a **favourites-based sidebar** and an
**App Store overlay** where users can browse, inspect, and favourite/unfavourite
apps. Use proper **Lucide React icons** instead of emoji.

## 3. User Stories

| # | Story | Priority |
|---|-------|----------|
| U1 | As a user, I want only my favourite apps in the sidebar so I can access them quickly without scrolling past apps I don't use. | P0 |
| U2 | As a user, I want to open an "App Store" view to browse all available apps with their descriptions. | P0 |
| U3 | As a user, I want to favourite/unfavourite apps so I can control what appears in the sidebar. | P0 |
| U4 | As a user, I want each app to show a proper icon (not emoji) that matches its identity. | P0 |
| U5 | As a user, I want to see an app's description, version, scope, and package name before adding it. | P1 |
| U6 | As a user, I want the Coding app (built-in) to always appear in the sidebar, regardless of favourites. | P0 |
| U7 | As a user, I want my favourites to persist across restarts. | P0 |
| U8 | As a user, I want to click on an app in the App Store to activate it (open it in the main area), even if it isn't favourited. | P1 |

## 4. Design

### 4.1 Sidebar Changes

**Before (current):**
```
┌──────────────────┐
│ APPS             │
│ 💻 Coding        │
│ ✅ Todo           │
│ 📦 Calculator     │
│ 📦 Notes          │
│ 📦 Weight         │
│ 📦 Tetris         │
│ 📦 Daily Quote    │
│ 📦 Plan Mode      │
│ 📦 Messenger      │
│ 📦 ImageGen       │
│ 📦 User Feedback  │
├──────────────────┤
│ Search sessions… │
│ Workspaces…      │
└──────────────────┘
```

**After:**
```
┌──────────────────┐
│ APPS        [⊞]  │  ← [⊞] button opens App Store
│ <> Coding        │  ← built-in, always shown
│ 📋 Plan Mode     │  ← Lucide icon, favourited
│ 📝 Notes         │  ← Lucide icon, favourited
│ ✓  Todo          │  ← Lucide icon, favourited
├──────────────────┤
│ Search sessions… │
│ Workspaces…      │
└──────────────────┘
```

**Key changes:**
- Only **favourited** apps and **built-in** apps appear in the sidebar list.
- A small `+` / grid button next to the "APPS" header opens the App Store overlay.
- Each app renders its **Lucide React icon component** (not emoji).
- First launch: a sensible default set of favourites is applied (e.g. Coding,
  Notes, Todo, Plan Mode) so the sidebar isn't empty.
- Sidebar ordering is deterministic: built-ins first (pinned), then favourited
  apps in the order of the `favouriteApps` array.

### 4.2 App Store Overlay

The App Store is a **modal/dialog overlay** (not a separate page or app) that
opens on top of the current view. It shows all discovered apps in a grid or
list layout.

```
┌─────────────────────────────────────────────────────────────┐
│  App Store                                             [✕]  │
├─────────────────────────────────────────────────────────────┤
│  Search apps…                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐  │
│  │ ★ ☐ Todo        │  │ ★ 📝 Notes      │  │ ☆ 🎮 Tetris│  │
│  │ v0.1.0          │  │ v0.1.0          │  │ v0.1.0     │  │
│  │ Todo app for    │  │ Note-taking app │  │ Tetris     │  │
│  │ Sero — Pi ext…  │  │ for Sero — …    │  │ game for…  │  │
│  │                 │  │                 │  │            │  │
│  │ 🏠 workspace    │  │ 🌐 global       │  │ 🏠 workspace│ │
│  └─────────────────┘  └─────────────────┘  └────────────┘  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐  │
│  │ ★ 💪 Weight     │  │ ☆ 🧮 Calculator │  │ ★ 📋 Plan  │  │
│  │ v0.1.0          │  │ v0.1.0          │  │ v0.1.0     │  │
│  │ Weight tracker  │  │ Modern calc…    │  │ Plan mode  │  │
│  │ app for Sero …  │  │                 │  │ for Sero…  │  │
│  │                 │  │                 │  │            │  │
│  │ 🌐 global       │  │ 🌐 global       │  │ 🏠 workspace│ │
│  └─────────────────┘  └─────────────────┘  └────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Each app card shows:**

| Field | Source | Example |
|-------|--------|---------|
| Icon | Lucide icon from `sero.app.icon` | `<Calculator />` |
| Name | `sero.app.name` | "Calculator" |
| Favourite toggle | User preference (★ filled / ☆ outline) | ★ |
| Version | `package.json → version` | "0.1.0" |
| Description | `package.json → description` | "Modern calculator app for Sero" |
| Scope badge | `sero.app.scope` | "global" or "workspace" |
| Package name | `package.json → name` | "@sero/calc" |

**Interactions:**
- **Click the star** → toggle favourite (add/remove from sidebar).
- **Click the star** does **not** activate the app card (stop event propagation).
- **Click the card** → activate the app (switch to it in main area) and close
  the overlay.
- **Search** → filter apps by name or description.

### 4.3 Icon System

**Current (broken):** A `ICON_MAP` of 6 entries maps Lucide string names to emoji.
Most apps get the fallback `📦`.

**Proposed:** Use actual **Lucide React icon components** rendered from the icon
name string in the manifest.

Implementation approach — a **dynamic icon resolver** utility:

```tsx
// src/lib/app-icons.ts
import {
  CheckSquare, Calculator, NotebookPen, HeartPulse,
  Gamepad2, Sparkles, ClipboardList, Radio, Image,
  MessageCircleQuestion, Code, Box,
} from 'lucide-react';

const ICON_REGISTRY: Record<string, React.ComponentType<{ className?: string }>> = {
  'check-square': CheckSquare,
  'calculator': Calculator,
  'notebook-pen': NotebookPen,
  'heart-pulse': HeartPulse,
  'gamepad-2': Gamepad2,
  'sparkles': Sparkles,
  'clipboard-list': ClipboardList,
  'radio': Radio,
  'image': Image,
  'message-circle-question': MessageCircleQuestion,
  'code': Code,
  'box': Box,
};

export function getAppIcon(iconName: string) {
  return ICON_REGISTRY[iconName] ?? Box;
}
```

This is a static map — each known Lucide name maps to the imported component.
Unknown icons fall back to `Box`. The map is extended whenever a new app is
added. Tree-shaking keeps the bundle lean.

Built-in apps should also use Lucide names in state (e.g. `coding` uses
`"code"`) so sidebar rendering can use a single icon path for built-in and
discovered apps.

> **Why not dynamic `import()`?** Lucide has 1500+ icons. A dynamic
> `import(`lucide-react/icons/${name}`)` would either bloat the bundle or
> require async loading with layout shift. A static registry of the ~15 icons
> actually used is simpler and instant.

### 4.4 Favourites Persistence

Favourites are stored as an array of app IDs in `~/.sero-ui/layout.json`
(the same file that persists `mainSidebarOpen` and `chatPanelOpen`).

```json
{
  "mainSidebarOpen": true,
  "chatPanelOpen": true,
  "favouriteApps": ["todo", "notes", "planmode", "weight-tracker"]
}
```

**IPC additions:**

| Layer | Change |
|-------|--------|
| `layout.json` schema | Add optional `favouriteApps: string[]` field (for backward compatibility with existing files) |
| `electron/ipc/layout.ts` | Extend `LayoutState`, parser/validator, and save/load handlers to preserve and validate `favouriteApps` |
| `electron/preload.ts` | Update `window.sero.layout.save/load` TypeScript signatures to include `favouriteApps` |
| `src/types/electron.d.ts` | Update `SeroLayoutAPI` `save/load` signatures to include `favouriteApps` |
| Zustand `app.ts` | Add `favouriteApps: string[]`, `toggleFavourite(id)`, `isFavourite(id)`, and derived sidebar filtering (without mutating the full `apps` registry) |

**Default favourites:** On first launch (when `favouriteApps` is missing from
`layout.json`), apply a default set: `["todo", "notes", "planmode"]`. The
built-in `coding` app is always shown regardless — it doesn't need to be in
the favourites array.

**Normalisation rules (load-time):**
- `favouriteApps` missing → apply defaults.
- `favouriteApps: []` → respect empty list (show only built-ins).
- Non-array / malformed entries → ignore invalid values and normalise to a
  string array.
- Duplicate IDs → de-duplicate while preserving first occurrence order.
- Unknown IDs (app currently unavailable) → keep in `favouriteApps` so they can
  reappear if the app is reinstalled.

### 4.5 Manifest Enrichment

The current `SeroAppManifest` type doesn't include `description` or `version`
from `package.json`. These need to be added:

```typescript
// Addition to SeroAppManifest in src/types/ipc.ts
export interface SeroAppManifest {
  // ... existing fields ...

  /** Package description from package.json. */
  description: string | null;
  /** Package version from package.json. */
  version: string | null;
  /** npm package name from package.json. */
  packageName: string | null;
}
```

The `parseManifest` function in `electron/app-discovery.ts` already reads the
full `package.json` — it just needs to extract these additional fields.

`author` metadata is out of scope for v1. Most current app packages do not set
an `author` field, so the App Store should not reserve UI space for it yet.

## 5. Component Breakdown

### New Files

| File | Purpose | LOC est. |
|------|---------|----------|
| `src/lib/app-icons.ts` | Lucide icon registry + `getAppIcon()` | ~40 |
| `src/components/layout/AppStoreDialog.tsx` | The App Store overlay (dialog + grid + search) | ~200 |
| `src/components/layout/AppStoreCard.tsx` | Individual app card within the store | ~80 |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/layout/MainSidebar.tsx` | Replace flat app list with favourites-only + "open store" button. Replace emoji with `getAppIcon()`. |
| `src/stores/app.ts` | Add `favouriteApps`, `toggleFavourite()`, `isFavourite()`. Keep `apps` as the full registry and derive sidebar-visible apps from favourites + built-ins. Persist via `layout.save()`. |
| `src/types/ipc.ts` | Add `description`, `version`, `packageName` to `SeroAppManifest`. |
| `electron/app-discovery.ts` | Extract `description`, `version`, `name` from `package.json` into manifest. |
| `electron/ipc/layout.ts` | Extend `LayoutState` schema + parser/validator for `favouriteApps`. |
| `electron/preload.ts` | Update layout bridge types for `favouriteApps`. |
| `src/types/electron.d.ts` | Update `SeroLayoutAPI` typings for `favouriteApps`. |

### No Changes Required

| File | Why |
|------|-----|
| `electron/ipc/apps.ts` | Discovery IPC unchanged — just returns richer manifests |
| `vite.config.ts` | No federation changes |
| `dev.sh` | No changes |

## 6. Data Flow

```
App Store open
  → user clicks ★ on "Calculator"
  → AppStoreDialog calls store.toggleFavourite("calc")
  → Zustand updates favouriteApps: [..., "calc"]
  → persistLayout() writes typed layout state to ~/.sero-ui/layout.json
  → MainSidebar re-renders (reads favouriteApps from store)
  → Calculator now appears in sidebar
```

```
App startup
  → loadLayout() reads layout.json (includes favouriteApps)
  → loadLayout() normalises favouriteApps (defaults only when field missing)
  → discoverAndRegisterApps() fetches manifests (now with description, version)
  → Zustand hydrates: apps = full registry, favouriteApps = persisted list
  → MainSidebar derives sidebar apps = built-ins + favourited discovered apps
```

## 7. Edge Cases

| Case | Behaviour |
|------|-----------|
| Favourited app is uninstalled | App ID stays in `favouriteApps` but no matching `AppEntry` exists → silently skipped in sidebar |
| New app discovered while app is running | `NewAppBanner` fires; app list is not hot-refreshed in v1, so the new app appears after restart |
| Empty favourites | Sidebar shows only the built-in Coding app + the "open store" button |
| Unknown icon name in manifest | Falls back to `Box` icon from Lucide |
| First launch (no layout.json) | Default favourites applied: `["todo", "notes", "planmode"]` |
| Existing layout.json without `favouriteApps` | Backward compatible: default favourites applied |
| `favouriteApps` contains duplicates/invalid values | Values are normalised (invalid removed, duplicates deduped, order preserved) |
| Active app is not favourited | App remains active in main area but is not shown in sidebar |

## 8. Out of Scope (Future)

- **App categories / tags** — Grouping apps by type (productivity, games, etc.).
  Would require adding a `category` field to the manifest.
- **App install/uninstall from the store** — Currently all apps are
  auto-discovered from packages. Future: `pi install` / `pi uninstall` from the
  UI.
- **Drag-to-reorder favourites** — Sidebar order matches the order in the
  `favouriteApps` array. Reordering via drag-and-drop is a future enhancement.
- **App screenshots/previews** — Rich media in the store cards.
- **App ratings or usage stats** — Tracking which apps are used most.
- **Custom user icons** — Letting users override the manifest icon.
- **Author metadata display** — Add if/when package manifests consistently
  provide `author`.

## 9. Implementation Plan

### Phase 1: Icon System + Manifest Enrichment
1. Create `src/lib/app-icons.ts` with the Lucide icon registry.
2. Add `description`, `version`, `packageName` to `SeroAppManifest` type.
3. Update `electron/app-discovery.ts` `parseManifest()` to extract new fields.
4. Update built-in app icon values (e.g. `coding` → `"code"`) so all apps use
   Lucide icon names consistently.
5. Update `MainSidebar.tsx` `AppItem` to use `getAppIcon()` instead of emoji.

### Phase 2: Favourites
1. Add `favouriteApps`, `toggleFavourite()`, `isFavourite()` to the app store.
2. Extend `electron/ipc/layout.ts` schema/parser/validator for `favouriteApps`
   (backward-compatible).
3. Update `electron/preload.ts` and `src/types/electron.d.ts` layout API types.
4. Extend `loadLayout()` to hydrate + normalise favourites (defaults only when
   field missing).
5. Keep `apps` as the full registry; derive sidebar-visible apps from
   favourites + built-ins.
6. Update `MainSidebar.tsx` to render the derived sidebar app list.
7. Add the "open store" button to the sidebar header.

### Phase 3: App Store Dialog
1. Build `AppStoreCard.tsx` — icon, name, description, version, scope badge,
   favourite toggle.
2. Build `AppStoreDialog.tsx` — search input, responsive grid of cards, close
   button.
3. Wire the "open store" button in `MainSidebar` to open the dialog.
4. Wire star click to toggle favourite without activating the card.
5. Wire card click to activate the app + close the dialog.

### Phase 4: Polish
1. Default favourites for first launch.
2. Handle edge cases (uninstalled favourites, empty state).
3. Verify active-unfavourited-app behaviour is intentional (main content active,
   no sidebar row).
4. Verify keyboard/focus behaviour (`Esc` closes dialog, focus trap, star/card
   interactions are accessible).
5. Verify dark/light theme consistency.
6. Ensure all files stay under 500 LOC.

## 10. Acceptance Criteria / Verification Checklist

- Existing users with an old `~/.sero-ui/layout.json` (no `favouriteApps`) do
  not lose layout settings and receive default favourites.
- `favouriteApps: []` persists and renders only the built-in Coding app.
- Toggling favourites updates the sidebar immediately and persists across app
  restart.
- Clicking a star in the App Store does not open/activate the app.
- Clicking an unfavourited app card activates it and closes the dialog (the app
  may remain absent from the sidebar).
- Unknown manifest icon names render the Lucide `Box` fallback without crashing.
- App Store search filters by app name and description.
- New app detection banner behavior is unchanged in v1 (restart required before
  app appears in the App Store/sidebar).
