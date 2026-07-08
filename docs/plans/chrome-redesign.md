# Application Chrome Redesign

Plan for a new shell chrome (header + footer) that looks identical on macOS,
Windows and Linux, stays aligned at any zoom level, and adds back/next
navigation and pinned shortcuts — without giving up app real estate.

Interactive mockup: [`chrome-redesign-mockup.html`](chrome-redesign-mockup.html)
(open in a browser — it demonstrates all behaviours below).

## Current state (what we're fixing)

| Area | Today | Problem |
|---|---|---|
| Window frame | `titleBarStyle: 'hiddenInset'` + hardcoded 78px traffic-light spacer (`TitleBar.tsx:30`) | macOS-only. On Windows/Linux the window is frameless with **no window controls at all**, and the 78px spacer is dead space. |
| Zoom | None. No `setZoomFactor`, no Ctrl+/− handling, chrome sized in fixed px | Chromium's default page zoom scales the chrome but not the native traffic lights → misalignment; chrome eats more space the more you zoom. |
| Navigation | Single `activeApp` string in `useAppStore`. No history. | No way to go back to the previous app/view. |
| Shortcuts | `favouriteApps` only controls the sidebar list | No one-click access from the chrome; sidebar must be open to switch apps. |

Header is 40px (`h-10`), footer 24px (`h-6`) — both stay. Total chrome
stays **64px**, unchanged.

## Design

### Header (40px, single row, draggable)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ●●● │ ⊞ │ ◀ ▶ │ [icon] Git · sero ☆ │   ⌂ ⎇ ⏰ ⚙   │ …app actions ⌘K 👤 ⊟ │─ ▢ ✕│
│ mac │toggle│nav│  breadcrumb + pin  │bookmark chips│      right cluster    │win/linux│
└────────────────────────────────────────────────────────────────────────────┘
```

- **Left**: platform window-control area (macOS traffic lights / empty
  elsewhere) → sidebar toggle → **back / forward** buttons → breadcrumb
  (`app icon + app name · workspace`) with a **pin star** to bookmark the
  current view.
- **Center**: **bookmark chips** — icon-only buttons (tooltip = label) that
  jump to a pinned app/view. Centered, draggable gaps around them, overflow
  menu after 8.
- **Right**: update indicator, contextual app actions (e.g. Git Ship),
  profile, ⌘K, chat toggle — then **window controls on Windows/Linux**.

### Footer (24px)

Left: workspace name + path (unchanged). Right: dev indicators, push-branch
picker, **zoom control (`− 100% +`, click % to reset)**, version, theme
toggle.

## 1. Cross-platform window frame

One header component, three thin platform branches in the main process
(`electron/app-main.ts`):

- **macOS**: keep `titleBarStyle: 'hiddenInset'`, `trafficLightPosition`
  centered for the 40px bar. Renderer reserves the left area.
- **Windows**: `titleBarStyle: 'hidden'` + `titleBarOverlay: { height: 40,
  color: <bg-base>, symbolColor: <text-primary> }`. Native min/max/close +
  Win 11 snap layouts, drawn by the OS over our bar's right edge.
- **Linux**: `frame: false`; we draw min/max/close ourselves in the header,
  wired via new IPC (`window.sero.window.minimize/maximize/close`).

The preload exposes `window.sero.platform` (`darwin | win32 | linux`) so the
header renders the correct reserved areas; widths come from
`env(titlebar-area-x/width)` where available instead of the hardcoded 78px.
`titleBarOverlay` colors are re-synced over IPC on theme change.

## 2. Zoom-invariant chrome

Add real zoom (missing today), and make the chrome **constant physical
size** so it never drifts against native controls and never costs extra
real estate:

- New `useZoomStore` + shortcuts (Cmd/Ctrl `+` `−` `0`) + footer control.
  Applies via IPC → `webContents.setZoomFactor(z)`; persisted as
  `zoomFactor` in `layout.json`.
- Renderer sets `--zoom-factor` on `:root`. Header/footer sizes become
  `calc(40px / var(--zoom-factor))` etc. (heights, icon sizes, chrome font
  size). Since CSS px × zoom = DIP, the bars render at exactly 40/24 DIP at
  every zoom level — pixel-identical to zoom 1.
- Payoff: macOS traffic lights (fixed DIP) and the Windows
  `titleBarOverlay` (fixed DIP height) stay aligned **without any re-sync
  IPC on zoom change**. Only the app content scales.
- Fallback considered: let the chrome scale and re-sync native anchors
  (`setWindowButtonPosition` / `setTitleBarOverlay`) on every zoom change —
  rejected: more IPC churn, chrome consumes real estate at high zoom.

## 3. Back / next navigation

New `src/stores/navigation.ts` (Zustand):

```ts
interface NavEntry { appId: string; viewId?: string; label: string }
// entries: NavEntry[], index: number  (capped at 50)
// push(entry), back(), forward(), canGoBack, canGoForward
```

- `setActiveApp` pushes an entry unless the change came from
  `back()/forward()` (flag argument). History is session-only (not
  persisted).
- `viewId` lets apps report sub-views via a new `@sero-ai/app-runtime` hook
  (`useNavView(viewId, label)`) so back can return *into* an app view (e.g.
  a specific Admin tab). v1 ships app-level history; the hook API is
  designed in but optional for plugins.
- Inputs: header buttons, Cmd/Ctrl+`[`/`]`, mouse buttons 4/5
  (`app-command`/`browser-backward|forward` in main → IPC).
- Long-press on back/forward shows a history dropdown (v2).

## 4. Bookmarks (chrome shortcuts)

- New `shortcuts: NavShortcut[]` (`{ appId, viewId?, label, icon }`) in
  `useAppStore`, persisted as `chromeShortcuts` in `LayoutState`. Separate
  from `favouriteApps` (which keeps controlling the sidebar list); defaults
  seeded from `favouriteApps` on first run.
- Pin/unpin via the breadcrumb star; unpin also via chip context menu.
- Chips navigate through the same `openApp`/nav-store path (so they create
  history entries). Also listed in the ⌘K command menu.

## Implementation phases

1. **Window frame parity** — `electron/app-main.ts` platform branches,
   Linux window-control IPC (types in `src/types/ipc.ts` → preload → main
   handler), `window.sero.platform`, remove hardcoded 78px spacer.
2. **Chrome refactor** — split `TitleBar.tsx` into
   `components/layout/titlebar/` zone components (nav cluster, breadcrumb,
   shortcuts, window controls, right cluster) to respect the 500 LOC rule;
   footer additions in `StatusBar.tsx`.
3. **Zoom** — `useZoomStore`, shortcuts in `useKeyboardShortcuts.ts`, zoom
   IPC, `--zoom-factor` counter-scaling, `zoomFactor` in `LayoutState`.
4. **Navigation** — `stores/navigation.ts`, header buttons, keyboard +
   mouse-button wiring.
5. **Bookmarks** — store + persistence + chips + pin star + ⌘K entries.
6. **Docs** — update `docs/architecture.md` shell diagram and
   `apps/docs-site`.

Each IPC addition follows the four-layer rule: React component → Zustand
store → preload → main handler.

## Risks / notes

- `titleBarOverlay` symbol colors only re-render on `setTitleBarOverlay` —
  must hook theme switching.
- Counter-scaled chrome means fractional CSS px inside the bars; they land
  on whole device pixels (40/z × z = 40 DIP) so rendering stays crisp.
- Mouse buttons 4/5 arrive differently per platform (`app-command` on
  Windows, `mouseup` events elsewhere) — needs a small main-process shim.
- Dragging: keep `.drag-region`/`.no-drag`; on Windows the overlay area is
  native so the right cluster must end before `env(titlebar-area-width)`.
