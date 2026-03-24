# Task: SERO-015 - Extract pi-plan-mode-extension to Plugin

**Created:** 2026-03-24
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Has a `skills/` directory (`plan-exit-review`), `shared/utils.ts` (extra shared file beyond types), `@mariozechner/pi-agent-core` peer dep, and inline `<style>` blocks with Google Fonts. No `@sero-ai/ui` imports, no standalone CSS file. The extra shared utility file and skills directory add modest complexity.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-015-extract-plan-mode/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-plan-mode-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-plan-mode-plugin`, renamed to `@sero-ai/plugin-plan-mode`. This package has a `skills/plan-exit-review/` directory, a `shared/utils.ts` in addition to `shared/types.ts`, and uses `@mariozechner/pi-agent-core` as a peer dep. No `@sero-ai/ui` imports. UI uses inline `<style>` blocks with Google Fonts.

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

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-plan-mode-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-plan-mode-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-plan-mode-extension`
- [ ] Confirm no `@sero-ai/ui` imports in any source files
- [ ] Verify `skills/plan-exit-review/SKILL.md` exists and needs to be included
- [ ] Note `shared/utils.ts` exists in addition to `shared/types.ts`
- [ ] Note `pi.skills` and `pi.extensions` fields in package.json
- [ ] Note `@mariozechner/pi-agent-core` is a peer dep
- [ ] Note no standalone CSS file — styles are inline in PlanMode.tsx
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/` (1 file + tsconfig), `shared/` (types.ts + utils.ts), `ui/` (2 files + tsconfig + index.html), `skills/`, `README.md`, `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-plan-mode`:
  - Replace `catalog:` deps with pinned versions (match reference todo plugin)
  - Replace `workspace:` refs with `^0.1.0` for `@sero-ai/app-runtime`
  - Preserve `pi.skills: ["./skills"]` and `pi.extensions` fields
  - Add `@mariozechner/pi-agent-core` as a peer dep
  - Add `sero.plugin` metadata (category: `developer-tools`, tags: `["plan-mode", "planning", "execution"]`)
- [ ] Create `tsconfig.extension.json` (match reference plugin)
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify no `catalog:` or `workspace:` references remain in package.json
- [ ] Verify `skills/plan-exit-review/SKILL.md` is present in the plugin
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` (describe plan mode, mention skills, install instructions, dev commands)
- [ ] Create `.gitignore` (dist/, .__mf__temp/, node_modules/)
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — document shared/utils.ts handling if not already covered

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-plan-mode`
- [ ] No `catalog:` or `workspace:` references in package.json
- [ ] `skills/` directory included with `skills/plan-exit-review/SKILL.md`
- [ ] `pi.skills` field preserved in package.json
- [ ] `shared/utils.ts` included alongside `shared/types.ts`
- [ ] `@mariozechner/pi-agent-core` present as peer dep
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-015): complete Step N — description`
- **Bug fixes:** `fix(SERO-015): description`

## Do NOT

- Remove the source package from the monorepo
- Keep `catalog:` or `workspace:` references in package.json
- Drop the `skills/` directory — it's part of the plugin
- Drop `shared/utils.ts` — it contains shared logic used by both extension and UI

---

## Amendments (Added During Execution)
