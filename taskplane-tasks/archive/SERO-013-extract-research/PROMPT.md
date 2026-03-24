# Task: SERO-013 - Extract pi-research-extension to Plugin

**Created:** 2026-03-24
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Largest extraction by LOC (~2279 lines across 11 source files). Has a `skills/` directory and `@sero-ai/ui` CSS `@source` reference in `styles.css` that must be removed. Also has `@mariozechner/pi-agent-core` as a peer dep (not all packages have this). No shadcn component imports, but the CSS cleanup and file count make this medium complexity.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-013-extract-research/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-research-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-research-plugin`, renamed to `@sero-ai/plugin-research`. This is a multi-agent research orchestrator with a `skills/` directory and a `styles.css` that references the monorepo `@sero-ai/ui` components via `@source`. No `@sero-ai/ui` component imports exist in the source — the only cleanup needed is the CSS `@source` path.

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

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-research-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-research-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-research-extension`
- [ ] Confirm no `@sero-ai/ui` component imports in source files (expect zero)
- [ ] Confirm `styles.css` has `@source "../../ui/src/components"` that must be removed
- [ ] Verify `skills/research/SKILL.md` exists and needs to be included
- [ ] Note `pi.skills` and `pi.extensions` fields in package.json
- [ ] Note `@mariozechner/pi-agent-core` is an additional peer dep
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/` (3 files + tsconfig), `shared/`, `ui/` (5 files + tsconfig), `skills/`, `vite.config.ts`
- [ ] Fix `ui/styles.css` — remove `@source "../../ui/src/components"` (monorepo-only path)
- [ ] Create `package.json` as `@sero-ai/plugin-research`:
  - Replace `catalog:` deps with pinned versions (match reference todo plugin)
  - Replace `workspace:` refs with `^0.1.0` for `@sero-ai/app-runtime`
  - Preserve `pi.skills: ["./skills"]` and `pi.extensions` fields
  - Add `sero.plugin` metadata (category: `productivity`, tags: `["research", "multi-agent", "orchestrator"]`)
  - Add `@mariozechner/pi-agent-core` as a peer dep
- [ ] Create `tsconfig.extension.json` (match reference plugin)
- [ ] Update `vite.config.ts` for standalone build (remove monorepo-specific config)

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify no `@sero-ai/ui` references remain
- [ ] Verify no `catalog:` or `workspace:` references remain in package.json
- [ ] Verify `skills/research/SKILL.md` is present in the plugin
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` (describe research orchestrator, mention skills, install instructions, dev commands)
- [ ] Create `.gitignore` (dist/, .__mf__temp/, node_modules/)
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — document any findings about CSS @source handling in plugin extraction

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-research`
- [ ] No `@sero-ai/ui` references remain (including CSS `@source`)
- [ ] No `catalog:` or `workspace:` references in package.json
- [ ] `skills/` directory included with `skills/research/SKILL.md`
- [ ] `pi.skills` field preserved in package.json
- [ ] `@mariozechner/pi-agent-core` present as peer dep
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-013): complete Step N — description`
- **Bug fixes:** `fix(SERO-013): description`

## Do NOT

- Remove the source package from the monorepo
- Keep `catalog:` or `workspace:` references in package.json
- Drop the `skills/` directory — it's part of the plugin
- Remove the CSS `@source` without verifying Tailwind classes still work

---

## Amendments (Added During Execution)
