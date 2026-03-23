# Task: SERO-007 - Extract pi-imagegen-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Multi-component UI with heavy `@sero/ui` usage (ScrollArea, Button, Popover, cn). All components need import replacement with inlined copies or lightweight alternatives. Medium complexity due to UI component inlining.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-007-extract-imagegen/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-imagegen-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-imagegen-plugin`, renamed to `@sero-ai/plugin-imagegen`. This package has significant `@sero/ui` imports: `ScrollArea`, `Button`, `Popover`, and `cn`. These shadcn/ui components must be inlined into the plugin (they are self-contained React components that only depend on Radix UI primitives + tailwind-merge + clsx).

## Dependencies

- **None**

## Context to Read First

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `docs/plan-plugin-extraction.md` — Plugin format spec (§1.1, §1.2, §4.2)

**Reference implementation (CRITICAL):**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/package.json`
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/vite.config.ts`

**Source files for @sero/ui components (inline these):**
- `packages/ui/src/lib/utils.ts` — `cn` utility
- `packages/ui/src/components/ui/scroll-area.tsx` — ScrollArea component
- `packages/ui/src/components/ui/button.tsx` — Button component
- `packages/ui/src/components/ui/popover.tsx` — Popover component

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-imagegen-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-imagegen-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-imagegen-extension`
- [ ] Catalogue all `@sero/ui` imports across all source files
- [ ] Read the source of each referenced `@sero/ui` component to understand their Radix/dep requirements
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/`, `shared/`, `ui/` (including `ui/components/`, `ui/hooks/`), `vite.config.ts`
- [ ] Create `ui/components/ui/` directory with inlined shadcn components: `button.tsx`, `scroll-area.tsx`, `popover.tsx`
- [ ] Create `ui/lib/utils.ts` with inlined `cn` utility
- [ ] Replace all `@sero/ui/components/ui/*` imports with `../components/ui/*` (relative)
- [ ] Replace all `@sero/ui/lib/utils` imports with `../lib/utils` (relative)
- [ ] Add required Radix UI dependencies: `@radix-ui/react-scroll-area`, `@radix-ui/react-popover`, plus `clsx`, `tailwind-merge`, `class-variance-authority`
- [ ] Create `package.json` as `@sero-ai/plugin-imagegen`:
  - Pin all versions, add Radix deps
  - Add `sero.plugin` metadata (category: `creative`, tags: `["image-generation", "ai-art", "gemini"]`)
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify no `@sero/ui` references remain in built output
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md`
- [ ] Create `.gitignore`
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — document the @sero/ui component inlining pattern if not already covered

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-imagegen`
- [ ] No `@sero/ui` imports remain — all components inlined
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-007): complete Step N — description`
- **Bug fixes:** `fix(SERO-007): description`

## Do NOT

- Remove the source package from the monorepo
- Keep `@sero/ui` as a dependency — inline all components
- Use `catalog:` or `workspace:` references
- Add the entire `@sero/ui` package as a dep — only inline the specific components used

---

## Amendments (Added During Execution)
