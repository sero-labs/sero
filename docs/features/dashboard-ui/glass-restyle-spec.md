# Dashboard UI — Glass restyle, reference set & styleguide

Follow-up spec to [dashboard-widgets-plan.md](./dashboard-widgets-plan.md). The
first pass shipped the dashboard component set but missed the point of it: the
components must look **coherent on the glass dashboard**, the examples belong
where widget authors can reach them (not a throwaway plugin), and they should be
previewable in the styleguide. This spec corrects that.

## Target

1. **Delete `sero-showcase-plugin`.** Ship the example widgets as an exported
   reference set inside `@sero-ai/ui`.
2. **Preview** the reference components in `apps/styleguide`, on a faithful glass
   board.
3. **Restyle** the dashboard component set in the dashboard's **glass**
   aesthetic, driven by a glass token scope owned by `@sero-ai/ui` that the host
   tile also adopts — so widget content reads as part of the frosted board.

## Decisions (locked via interview)

| # | Decision | Choice |
|---|---|---|
| 1 | Glass mechanism | **Token-scope class** — a `.glass` scope remaps surface/border tokens to translucent values; components stay single-source and auto-adapt. No cloned primitive files. |
| 2 | Inner backdrop-blur | **None** — the host tile provides the single `backdrop-filter`. Inner surfaces are translucent overlays only (avoids muddy double-blur + GPU cost). |
| 3 | Reference widgets | **Exported subpath** `@sero-ai/ui/reference` (importable + copy-pasteable), kept out of the main barrel. |
| 4 | Glass vs solid per context | **Auto via `WidgetContent`** — it applies the glass scope by default; full plugin views opt out. |
| 5 | Token source of truth | **`@sero-ai/ui` owns the glass tokens; the host `dashboard.css` adopts them** (`--dash-*` derive from `--glass-*`). |
| 6 | Preview fidelity | **Shared glass-board fixture** — a CSS file in `@sero-ai/ui` (`.glass-canvas` + `.glass-tile`) consumed by the host dashboard and the styleguide. |
| 7 | Themes | **Both light + dark** (frosted white glass / low-opacity over dark canvas). |
| 8 | Migration | **Delete the plugin, keep the Cron/Web/Notes refactors** — they inherit glass automatically via `WidgetContent`. |
| 9 | Elevation | **Two levels** — `--glass-surface` (raised: MetricCard) and `--glass-surface-flat` (rows). Section has no fill. |
| 10 | Remap breadth | **Containers + borders** — remap `--card`, dashboard surface tokens, `--border`, rims. Keep form controls (`--input`, select) and portalled popovers **solid**. |
| 11 | Reference set | **3 widgets + a minimal starter** (Scheduler, Resource monitor, Activity feed, Starter). |
| 12 | Legibility | **Tune surface opacity** so `--text-muted` stays legible on the canvas glow; no per-text scrim. Verify in styleguide, both themes. |
| 13 | Solid opt-out | **`glass` prop on `WidgetContent`, default `true`**; `glass={false}` for solid full-view usage. |
| 14 | Board fixture form | **Exported CSS classes** (`@sero-ai/ui/styles/glass-board.css`); host keeps react-grid and applies the classes. |
| 15 | Reference behaviour | **Pure static** — fixed sample data, no local state/controls. Styleguide adds any toggles externally. |

## Gap analysis (current → target)

| Area | Current (shipped) | Target | Gap |
|---|---|---|---|
| Component surfaces | Solid: `MetricCard` uses `bg-[var(--bg-surface)]`; `ItemListItem` uses `variant="muted"` (`bg-muted/50`); `Status` neutral pill uses `--bg-elevated`; skeletons use `--accent`. | Translucent glass surfaces via component-facing surface tokens that flip in the `.glass` scope. | Components hard-code solid design tokens. Must route surfaces through `--surface-*` tokens. |
| Glass scope | None. | `.glass` token scope in `@sero-ai/ui` globals.css (light + dark) remapping container/border tokens. | Does not exist. |
| Glass tokens | Host owns `--dash-tile/-rim/-seam` in `apps/desktop/.../dashboard.css`; nothing in the UI package. | Canonical `--glass-*` tokens in `@sero-ai/ui`; host `--dash-*` derive from them. | Token language is host-local; must move to UI and have the host adopt. |
| `WidgetContent` | Plain frame, no surface awareness. | Adds `.glass` scope by default; `glass={false}` opts out. | Needs the `glass` prop + scope class. |
| Reference widgets | Live in `plugins/sero-showcase-plugin` (built-in, ships to all users). | Exported from `@sero-ai/ui/reference`; plugin deleted. | Plugin must be removed; widgets ported + restyled + re-exported via a new subpath. |
| Glass board reuse | Board look is host-only CSS. | Shared `glass-board.css` in UI, imported by host + styleguide. | Extract + host refactor to import it. |
| Styleguide | No dashboard/glass section. | A "Dashboard widgets" section rendering the reference set on the shared glass board, light + dark. | Add section + import board fixture + reference set. |
| Primitives in widgets | `Badge`/`Button` etc. read solid tokens. | Container-ish primitives (`Card`, `secondary`) adapt in glass; form controls stay solid. | Scope must remap the right subset only. |

Unchanged and kept: the component APIs, the catalogue + `dashboard-catalog`
subpath, the `sero-dashboard-ui` skill, the docs-site reference, and the
Cron/Web/Notes refactors (they gain glass for free).

## Token architecture

### 1. Canonical glass tokens (`@sero-ai/ui/src/styles/globals.css`)

Starting values (tune in the styleguide; they mirror the host `--dash-*`
relationships). Light = frosted white; dark = low-opacity white over dark canvas.

```css
:root {
  --glass-tile:          rgba(255,255,255,0.52); /* base tile (host) */
  --glass-surface:       rgba(255,255,255,0.62); /* raised card */
  --glass-surface-flat:  rgba(255,255,255,0.40); /* flat row */
  --glass-border:        rgba(15,17,23,0.10);
  --glass-rim:           rgba(255,255,255,0.60);
  --glass-hover:         rgba(255,255,255,0.72);
}
.dark {
  --glass-tile:          rgba(255,255,255,0.06);
  --glass-surface:       rgba(255,255,255,0.09);
  --glass-surface-flat:  rgba(255,255,255,0.05);
  --glass-border:        rgba(255,255,255,0.12);
  --glass-rim:           rgba(255,255,255,0.08);
  --glass-hover:         rgba(255,255,255,0.13);
}
```

Layering: `tile (base) < flat row < raised card`, each lifted by `--glass-rim`
(an inset top highlight, the signature glass detail).

### 2. Component-facing surface tokens (default solid → glass in scope)

Components stop hard-coding `--bg-surface` etc. and read these instead. Defaults
keep the current solid look everywhere outside the scope:

```css
:root, .dark {
  --surface-raised: var(--bg-surface);
  --surface-flat:   var(--bg-elevated);
  --surface-line:   var(--border-subtle);
  --surface-rim:    transparent;
}
```

### 3. The `.glass` scope

```css
.glass {
  /* component surface tokens */
  --surface-raised: var(--glass-surface);
  --surface-flat:   var(--glass-surface-flat);
  --surface-line:   var(--glass-border);
  --surface-rim:    var(--glass-rim);

  /* containers + borders for primitives used inside widgets (decision 10) */
  --card:      var(--glass-surface);
  --secondary: var(--glass-surface-flat);
  --muted:     var(--glass-surface-flat);
  --accent:    var(--glass-surface-flat);
  --border:    var(--glass-border);

  /* keep interactive controls + portalled surfaces solid */
  --input:   var(--border-subtle);
  --popover: var(--bg-elevated);
  --ring:    var(--border-focus);
}
```

Scope is applied by `WidgetContent` (subtree-local), so it only affects widget
content. Portalled menus/popovers render at `document.body`, outside the scope,
so they stay solid regardless.

### 4. Host adoption (`apps/desktop/.../dashboard.css`)

Refactor `--dash-*` to derive from the canonical tokens (values, not logic):

```css
.sero-dashboard .dash-tile { /* via glass-board.css, see below */ }
/* --dash-tile      -> var(--glass-tile) (+ hover var(--glass-hover))
   --dash-rim       -> var(--glass-rim)
   --dash-seam      -> var(--glass-border) */
```

## Glass-board fixture (`@sero-ai/ui/styles/glass-board.css`)

Extract the canvas-glow + tile surface into a shared, framework-agnostic CSS
file. Registered as a subpath (it already resolves via `./styles/*`).

```css
/* .glass-canvas — ambient accent-glow backdrop */
.glass-canvas { background: radial-gradient(...) var(--dash-canvas-base); }
/* .glass-tile — translucent, backdrop-blurred surface with luminous rim */
.glass-tile {
  background: var(--glass-tile);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(24px) saturate(140%);
  box-shadow: inset 0 1px 0 var(--glass-rim);
}
.glass-tile:hover { background: var(--glass-hover); }
```

- The **host** `DashboardWidget` applies `.glass-tile` (replacing the inline
  `.dash-tile` rules, which move here); `Dashboard.tsx` root keeps `.glass-canvas`.
- The **styleguide** imports this file and frames each reference widget in a
  `.glass-canvas` → `.glass-tile` → widget, so previews match the real board.

## Component changes

Route every surface through the new tokens; add the rim highlight. No API
changes, no new backdrop-blur.

| Component | Change |
|---|---|
| `MetricCard` | `bg-[var(--surface-raised)] border-[var(--surface-line)]` + `shadow-[inset_0_1px_0_var(--surface-rim)]`. |
| `ItemListItem` | Drop `variant="muted"`; use `bg-[var(--surface-flat)]`, hover `--glass-hover`. |
| `Status` (neutral pill) | `tone.ts` neutral pill → `--surface-flat` instead of `--bg-elevated`. |
| `Section` | No fill (unchanged); headings/dividers only. |
| `EmptyState` | Hairline via `--surface-line`; icon media surface → `--surface-flat`. |
| Skeleton patterns | Shimmer base → a translucent value so it reads on glass. |
| `ProgressRing` | Track stroke `--surface-line` (was `--border-subtle`). |
| `WidgetContent` | Add `glass?: boolean` (default `true`) → toggles the `glass` class. Frame stays transparent (tile shows through). |
| `Divider` | Uses `--border` → adapts via scope automatically. |

`Metric`, `Text`, `Heading`, `KeyValue`, `Inline`, `Stack`, `Grid` need no
surface change (no fills).

## Reference set (`@sero-ai/ui/reference`)

- New dir `packages/ui/src/components/reference/` with pure-static widgets:
  `StarterExample` (minimal: headline metric + short list), `SchedulerExample`,
  `ResourceExample`, `ActivityExample` (ported from the deleted plugin, restyled,
  demo state/buttons removed).
- New file `packages/ui/src/reference.ts` re-exporting them.
- Register `./reference` in both `exports` and `publishConfig.exports` in
  `packages/ui/package.json` (mirrors the `dashboard-catalog` subpath).
- They depend only on `@sero-ai/ui` + `lucide-react` (no `app-runtime`), so they
  render anywhere.

## Styleguide integration (`apps/styleguide`)

- Import `@sero-ai/ui/styles/glass-board.css` in `index.css`.
- Add a **Dashboard widgets** fixture to `App.tsx`: for each reference widget,
  render it inside `.glass-canvas` → `.glass-tile` at the review sizes
  (1×1 / 2×2 / 3×2). The existing light/dark + theme toggles drive it.
- This is the review surface that replaces the deleted plugin's gallery.

## Migration

- Delete `plugins/sero-showcase-plugin/` (and remove any leftover `preview/`
  harness). It is a built-in, so removal also stops the "Showcase" app shipping.
- Keep `CronWidget`, `WebWidget`, `NotesWidget` refactors — they use
  `WidgetContent`, so they become glass automatically; verify no ad-hoc solid
  surfaces remain.
- `@sero-ai/ui` stays at the unpublished `0.4.0`; fold the glass work + reference
  subpath into that version's CHANGELOG entry.

## Implementation plan

### Phase A — Glass tokens & scope ☑
- [x] Add canonical `--glass-*` tokens (light + dark) and component-facing
      `--surface-*` tokens + the `.glass` scope to `globals.css`.
- [x] Route the component surfaces through `--surface-*` (table above).
      (Skeletons + `Divider` adapt for free via the scope's `--accent`/`--border` remap.)
- [x] Add `glass` prop to `WidgetContent` (default true → `.glass` class).
**Gate:** ☑ UI typecheck + build + tests (34) pass; a `glass.test.tsx` asserts
`WidgetContent` scopes by default and surfaces route through `--surface-*`.

### Phase B — Shared glass board & host adoption ☑
- [x] Create `styles/glass-board.css` (`.glass-canvas`, `.glass-tile`).
- [x] Refactor `apps/desktop/.../dashboard.css` + `DashboardWidget`/`Dashboard`
      to consume the shared classes and derive `--dash-*` from `--glass-*`.
**Gate:** ☑ desktop typecheck passes; no duplicated tile/canvas values remain
(host CSS now only holds `--dash-*` chrome + react-grid overrides). Live-dashboard
visual check folds into the Phase D shared-board screenshots (identical classes).

### Phase C — Reference set & subpath ☑
- [x] Build `components/reference/*` (Starter + 3), pure static, glass-styled.
- [x] Add `reference.ts` + register `./reference` in both exports maps.
- [x] Delete `plugins/sero-showcase-plugin/`.
**Gate:** ☑ `@sero-ai/ui/reference` resolves packed (`npm pack` shows
`dist/reference.*` + `dist/styles/glass-board.css`); root typecheck 19→18 tasks
green after plugin removal.

### Phase D — Styleguide preview ☑
- [x] Import the board fixture; add the Dashboard widgets section (`DashboardFixture.tsx`)
      rendering the reference set on `.glass-tile` at each size.
- [x] Capture styleguide screenshots (light + dark). Starting `--glass-*`
      opacities held up in both themes — no tuning needed (decision 12).
**Gate:** ☑ screenshots reviewed in both themes; `--text-muted` legible on every
surface; cards read as raised, rows as flat.

### Phase E — Docs & catalogue sync ☑
- [x] Update the `sero-dashboard-ui` skill + docs-site reference: glass is
      automatic via `WidgetContent`, `glass={false}` for full views, reference
      set import path, no manual glass classes.
- [x] Note the `@sero-ai/ui/reference` subpath in the catalogue/README + CHANGELOG.
**Gate:** ☑ docs-site builds; skill frontmatter intact (no dedicated validator).

## Acceptance criteria

- [x] Dashboard components render as translucent glass inside `WidgetContent`
      (raised cards vs flat rows visible) and revert to solid with `glass={false}`
      or outside `WidgetContent`.
- [x] The host dashboard and the styleguide share one glass-board source; the
      real dashboard is value-preserving (CSS-only refactor, verified via shared board).
- [x] `sero-showcase-plugin` is removed; the reference set ships from
      `@sero-ai/ui/reference` and renders in the styleguide.
- [x] Text stays legible on glass in light and dark (verified by screenshot).
- [x] Form controls and portalled popovers remain solid/readable inside widgets
      (scope pins `--input`/`--popover` solid; popovers portal outside the scope).
- [x] `pnpm typecheck`, UI tests, and UI + desktop builds pass.

## Risks

- **Double blur / muddiness** — mitigated by decision 2 (no inner blur).
- **Contrast on translucent surfaces** — mitigated by tuning opacity in the
  styleguide before finalising (decision 12); dark is the primary target.
- **Host regression** — the tile refactor is CSS-only and value-preserving;
  verify the live dashboard after Phase B.
- **Scope leakage** — the `.glass` scope is subtree-local and pins
  `--input`/`--popover` solid; portalled menus are unaffected.
