# Task: SERO-008 - Extract pi-humanizer-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Most complex `@sero-ai/ui` usage of all extractions (Button, Input, Textarea, Dialog, Tooltip, ScrollArea, cn). Also has a `skills/` directory and `streamdown` runtime dep. Requires careful inlining of 6+ shadcn components.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-008-extract-humanizer/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-humanizer-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-humanizer-plugin`, renamed to `@sero-ai/plugin-humanizer`. This is the most component-heavy extraction: it uses Button, Input, Textarea, Dialog, Tooltip, ScrollArea, and cn from `@sero-ai/ui`. It also has a `skills/` directory (Pi skill definitions) and `streamdown` as a runtime devDep. All shadcn components must be inlined.

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

**Source files for @sero-ai/ui components (inline these):**
- `packages/ui/src/lib/utils.ts` — `cn` utility
- `packages/ui/src/components/ui/button.tsx`
- `packages/ui/src/components/ui/input.tsx`
- `packages/ui/src/components/ui/textarea.tsx`
- `packages/ui/src/components/ui/dialog.tsx`
- `packages/ui/src/components/ui/tooltip.tsx`
- `packages/ui/src/components/ui/scroll-area.tsx`

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-humanizer-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-humanizer-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-humanizer-extension`
- [ ] Catalogue all `@sero-ai/ui` imports across all source files — expected: Button, Input, Textarea, Dialog, Tooltip, ScrollArea, cn
- [ ] Read source of each @sero-ai/ui component to catalogue Radix UI deps needed
- [ ] Verify `skills/humanizer/SKILL.md` exists and needs to be included
- [ ] Note `streamdown` devDep and `pi.skills` field in package.json
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/`, `shared/`, `ui/` (including `ui/components/`, `ui/lib/`), `skills/`, `vite.config.ts`
- [ ] Create `ui/components/ui/` with inlined shadcn components: `button.tsx`, `input.tsx`, `textarea.tsx`, `dialog.tsx`, `tooltip.tsx`, `scroll-area.tsx`
- [ ] Create `ui/lib/utils.ts` with inlined `cn` utility
- [ ] Replace all `@sero-ai/ui/*` imports with relative paths throughout the codebase
- [ ] Add required deps: Radix UI packages (`@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-scroll-area`), `clsx`, `tailwind-merge`, `class-variance-authority`
- [ ] Create `package.json` as `@sero-ai/plugin-humanizer`:
  - Keep `streamdown` as a devDependency
  - Preserve `pi.skills: ["./skills"]` field
  - Add `sero.plugin` metadata (category: `creative`, tags: `["humanizer", "writing", "ai-detection"]`)
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify no `@sero-ai/ui` references remain
- [ ] Verify `skills/humanizer/SKILL.md` is present in the plugin
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` (mention the Pi skill capability)
- [ ] Create `.gitignore`
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — document skills directory handling in plugin extraction

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-humanizer`
- [ ] No `@sero-ai/ui` imports remain — all 6 components inlined
- [ ] `skills/` directory included with SKILL.md
- [ ] `pi.skills` field preserved in package.json
- [ ] `streamdown` present as devDep
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-008): complete Step N — description`
- **Bug fixes:** `fix(SERO-008): description`

## Do NOT

- Remove the source package from the monorepo
- Keep `@sero-ai/ui` as a dependency
- Drop the `skills/` directory — it's part of the plugin
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
