# SERO-007: Extract pi-imagegen-extension to Plugin — Status

**Current Step:** Step 4: Documentation & Delivery
**Status:** ✅ Complete
**Last Updated:** 2026-03-24
**Review Level:** 1
**Review Counter:** 3
**Iteration:** 5
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Source package exists at `packages/pi-imagegen-extension`
- [x] Catalogued all `@sero-ai/ui` imports (ScrollArea, Button, Popover, cn)
- [x] Read source of each @sero-ai/ui component for dep requirements
- [x] Reference plugin exists at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main`

**Findings:**

**@sero-ai/ui imports across all source files:**
| File | Import |
|------|--------|
| `ui/ImageGenApp.tsx` | `ScrollArea` from `@sero-ai/ui/components/ui/scroll-area` |
| `ui/components/ImageAttachBar.tsx` | `cn` from `@sero-ai/ui/lib/utils` |
| `ui/components/Gallery.tsx` | `cn` from `@sero-ai/ui/lib/utils` |
| `ui/components/GenerateForm.tsx` | `cn`, `Button` |
| `ui/components/MontageCard.tsx` | `cn`, `Button`, `Popover`, `PopoverTrigger`, `PopoverContent` |
| `ui/components/ImageViewer.tsx` | `cn`, `Button`, `Popover`, `PopoverTrigger`, `PopoverContent` |

**Components used (to inline):**
- `cn` utility → depends on `clsx` + `tailwind-merge`
- `Button` → depends on `class-variance-authority` + `radix-ui` (Slot)
- `ScrollArea` → depends on `radix-ui` (ScrollAreaPrimitive)
- `Popover`, `PopoverTrigger`, `PopoverContent` → depends on `radix-ui` (PopoverPrimitive)

**Radix UI:** The monorepo uses the unified `radix-ui` package (v^1.4.3) — imports are `from "radix-ui"`, not separate `@radix-ui/*` packages. Must use `radix-ui` in plugin.

**Note on Popover:** Only `Popover`, `PopoverTrigger`, `PopoverContent` are used (NOT `PopoverAnchor`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription`). All can be inlined as-is.

**Monorepo package.json dependencies to pin in plugin:**
- `radix-ui: ^1.4.3`
- `class-variance-authority: ^0.7.1`
- `clsx: ^2.1.1`
- `tailwind-merge: ^3.5.0`

**Source file inventory:**
- `extension/index.ts` — Pi extension (tools, commands)
- `extension/tsconfig.json` — extends `../../tsconfig.extension.json`
- `shared/types.ts` — TypeScript types
- `ui/ImageGenApp.tsx` — root federated component
- `ui/components/EmptyState.tsx`, `Gallery.tsx`, `GenerateForm.tsx`, `ImageAttachBar.tsx`, `ImageViewer.tsx`, `MontageCard.tsx`
- `ui/hooks/use-image-loader.ts`
- `ui/styles.css`
- `ui/index.html`
- `ui/tsconfig.json`
- `vite.config.ts`

**Reference plugin:** `sero-todo-plugin-main` — package.json structure + vite.config.ts confirmed.

---

### Step 1: Scaffold Plugin Repo
**Status:** ✅ Complete

- [x] Create plugin directory and copy source files
- [x] Inline shadcn components (button, scroll-area, popover) into ui/components/ui/
- [x] Inline cn utility into ui/lib/utils.ts
- [x] Replace all @sero-ai/ui imports with relative paths
- [x] Add Radix UI + utility dependencies
- [x] Create package.json with plugin metadata
- [x] Create tsconfig files and update vite.config.ts

---

### Step 2: Install, Build & Verify
**Status:** ✅ Complete

- [x] npm install succeeds
- [x] npm run build produces dist/ui/remoteEntry.js
- [x] npm run typecheck passes
- [x] No @sero-ai/ui references in output
- [x] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** ✅ Complete

- [x] README.md created
- [x] .gitignore created (includes node_modules, dist, .__mf__temp)
- [x] Git repo initialized + initial commit (ca5668e)

---

### Step 4: Documentation & Delivery
**Status:** ✅ Complete

- [x] Discoveries logged
- [x] `docs/plan-plugin-extraction.md` updated with radix-ui unified package pattern + shadcn inlining guidance
- [x] `.DONE` created

---

## Reviews

| # | Type | Step | Verdict | File |
| R001 | plan | Step 1 | UNAVAILABLE | .reviews/R001-plan-step1.md |
| R002 | plan | Step 2 | UNAVAILABLE | .reviews/R002-plan-step2.md |
| R003 | plan | Step 3 | UNAVAILABLE | .reviews/R003-plan-step3.md |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|
| `radix-ui` unified package (not separate `@radix-ui/*`) | Use `radix-ui: ^1.4.3` in plugin deps | Step 1 |
| `Button` uses `Slot.Root` from `radix-ui` (not `@radix-ui/react-slot`) | Import `{ Slot } from 'radix-ui'` in inlined button.tsx | Step 1 |
| `ScrollArea` uses `ScrollArea as ScrollAreaPrimitive` from `radix-ui` | Import `{ ScrollArea as ScrollAreaPrimitive } from 'radix-ui'` | Step 1 |
| `Popover` uses `Popover as PopoverPrimitive` from `radix-ui` | Import `{ Popover as PopoverPrimitive } from 'radix-ui'` | Step 1 |
| Only 3 Popover exports needed | `Popover`, `PopoverTrigger`, `PopoverContent` — trim unused exports | Step 1 |

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-23 | Task staged | PROMPT.md and STATUS.md created |
| 2026-03-24 20:02 | Task started | Extension-driven execution |
| 2026-03-24 20:02 | Step 0 started | Preflight |
| 2026-03-24 20:02 | Skip plan review | Step 0 (Preflight) — low-risk |
| 2026-03-24 20:10 | Step 0 complete | All preflight checks passed, findings documented |
| 2026-03-24 20:04 | Worker iter 1 | done in 102s, ctx: 19%, tools: 35 |
| 2026-03-24 20:04 | Step 0 complete | Preflight |
| 2026-03-24 20:04 | Step 1 started | Scaffold Plugin Repo |
| 2026-03-24 20:04 | Reviewer R001 | plan review — reviewer did not produce output |
| 2026-03-24 20:04 | Review R001 | plan Step 1: UNAVAILABLE |
| 2026-03-24 | Worker iter 2 | Step 1 complete — plugin scaffolded at sero-imagegen-plugin |
| 2026-03-24 20:10 | Worker iter 2 | done in 405s, ctx: 31%, tools: 68 |
| 2026-03-24 20:10 | Step 1 complete | Scaffold Plugin Repo |
| 2026-03-24 20:10 | Step 2 started | Install, Build & Verify |
| 2026-03-24 20:10 | Reviewer R002 | plan review — reviewer did not produce output |
| 2026-03-24 20:10 | Review R002 | plan Step 2: UNAVAILABLE |
| 2026-03-24 20:15 | Step 2 complete | npm install ✓, build ✓ (remoteEntry.js + mf-manifest.json), typecheck ✓ (0 errors), no @sero-ai/ui refs |
| 2026-03-24 20:12 | Worker iter 3 | done in 73s, ctx: 9%, tools: 19 |
| 2026-03-24 20:12 | Step 2 complete | Install, Build & Verify |
| 2026-03-24 20:12 | Step 3 started | Create README & Git Init |
| 2026-03-24 20:12 | Reviewer R003 | plan review — reviewer did not produce output |
| 2026-03-24 20:12 | Review R003 | plan Step 3: UNAVAILABLE |
| 2026-03-24 | Step 3 complete | README.md + .gitignore + git init + initial commit ca5668e |
| 2026-03-24 20:13 | Worker iter 4 | done in 75s, ctx: 9%, tools: 16 |
| 2026-03-24 20:13 | Step 3 complete | Create README & Git Init |
| 2026-03-24 20:13 | Step 4 started | Documentation & Delivery |
| 2026-03-24 20:13 | Skip plan review | Step 4 (final step) — low-risk |
| 2026-03-24 20:20 | Step 4 complete | Discoveries logged; docs/plan-plugin-extraction.md updated (radix-ui unified package + shadcn inlining); .DONE created |
| 2026-03-24 20:14 | Worker iter 5 | done in 83s, ctx: 10%, tools: 21 |
| 2026-03-24 20:14 | Step 4 complete | Documentation & Delivery |
| 2026-03-24 20:14 | Task complete | .DONE created |
| 2026-03-24 20:14 | Archived | Moved to /Users/danielcarter/Documents/Dev/projects/sero/sero/taskplane-tasks/archive/SERO-007-extract-imagegen |

---

## Blockers

*None*

---

## Notes

- `extension/tsconfig.json` extends `../../tsconfig.extension.json` — for the standalone plugin, need to create a self-contained `tsconfig.extension.json` at the plugin root.
- `ui/tsconfig.json` has `paths` for `@sero-ai/app-runtime` and `@sero-ai/ui` — plugin version will resolve `@sero-ai/app-runtime` via node_modules (installed as devDep), and `@sero-ai/ui` paths will be removed (components inlined).
- The `sero_imagegen` federation name should stay as-is in plugin.
- `ui/styles.css` had `@source "../../ui/src/components"` — removed for standalone plugin; Tailwind scans local source files automatically.
- `ui/tsconfig.json` `paths` for `@sero-ai/app-runtime`/`@sero-ai/ui` removed — app-runtime resolves via node_modules, ui is inlined.
