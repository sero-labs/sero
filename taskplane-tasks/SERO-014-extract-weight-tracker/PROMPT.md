# Task: SERO-014 - Extract pi-weight-tracker to Plugin

**Created:** 2026-03-24
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Straightforward extraction — no `@sero-ai/ui` imports, no skills directory, no CSS file. Uses inline `<style>` blocks and Google Fonts import. Has `scope: "global"` in sero.app manifest which must be preserved. Simplest of the three extractions.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-014-extract-weight-tracker/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-weight-tracker` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-weight-tracker-plugin`, renamed to `@sero-ai/plugin-weight-tracker`. This is a clean extraction: no `@sero-ai/ui` component imports, no skills directory, no standalone CSS file. The UI uses inline `<style>` blocks with a Google Fonts import and Tailwind classes. Note the `scope: "global"` field in the sero.app manifest — this must be preserved.

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

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-weight-tracker-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-weight-tracker-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-weight-tracker`
- [ ] Confirm no `@sero-ai/ui` imports in any source files
- [ ] Confirm no skills directory (no `pi.skills` field in package.json)
- [ ] Note `scope: "global"` in sero.app manifest
- [ ] Note no standalone CSS file — styles are inline in WeightTracker.tsx
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/` (1 file + tsconfig), `shared/`, `ui/` (6 files + tsconfig + index.html), `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-weight-tracker`:
  - Replace `catalog:` deps with pinned versions (match reference todo plugin)
  - Replace `workspace:` refs with `^0.1.0` for `@sero-ai/app-runtime`
  - Preserve `scope: "global"` in sero.app manifest
  - No `pi.skills` field (this package has none)
  - Add `sero.plugin` metadata (category: `health`, tags: `["weight", "tracker", "health", "fitness"]`)
- [ ] Create `tsconfig.extension.json` (match reference plugin)
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify no `catalog:` or `workspace:` references remain in package.json
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` (describe weight tracker, install instructions, dev commands)
- [ ] Create `.gitignore` (dist/, .__mf__temp/, node_modules/)
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — document `scope: "global"` handling in plugin extraction if not already covered

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-weight-tracker`
- [ ] No `catalog:` or `workspace:` references in package.json
- [ ] `scope: "global"` preserved in sero.app manifest
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-014): complete Step N — description`
- **Bug fixes:** `fix(SERO-014): description`

## Do NOT

- Remove the source package from the monorepo
- Keep `catalog:` or `workspace:` references in package.json
- Drop the `scope: "global"` field from sero.app manifest
- Add `pi.skills` — this package has none

---

## Amendments (Added During Execution)
