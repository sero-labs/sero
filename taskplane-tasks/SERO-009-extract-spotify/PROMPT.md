# Task: SERO-009 - Extract pi-spotify-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Largest pure extraction (~3200 LOC). Multi-file extension (`extension/lib/`), complex UI (`ui/components/`, `ui/lib/`, `ui/styles/`), auth callback HTML, and Spotify Web Playback SDK integration. No `@sero/ui` imports. Scope: global.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-009-extract-spotify/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-spotify-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin`, renamed to `@sero-ai/plugin-spotify`. This is the largest extraction by LOC. It has a multi-file extension (with `extension/lib/`), complex UI with components/lib/styles subdirectories, and a `spotify-auth-callback.html`. No `@sero/ui` usage despite being complex. Has a `.gitignore` and `README.md` in source.

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

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-spotify-extension`
- [ ] Inventory full file tree including `extension/lib/`, `ui/components/`, `ui/lib/`, `ui/styles/`, `spotify-auth-callback.html`
- [ ] Confirm no `@sero/ui` imports
- [ ] Note existing `.gitignore` and `README.md` in source (adapt, don't create from scratch)
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy all source files preserving full directory tree
- [ ] Copy/adapt the existing `README.md` from source (update install instructions for plugin format)
- [ ] Create `package.json` as `@sero-ai/plugin-spotify`:
  - Pin all `catalog:` refs, replace `workspace:` refs
  - Preserve `scope: "global"` in sero.app
  - Add `sero.plugin` metadata (category: `entertainment`, tags: `["spotify", "music", "playback", "streaming"]`)
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs
- [ ] Update `vite.config.ts` for standalone build
- [ ] Ensure `spotify-auth-callback.html` is included in the UI directory

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Finalize README & Git Init

- [ ] Finalize `README.md` with plugin install instructions
- [ ] Create/update `.gitignore`
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)
**Check If Affected:** (none)

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-spotify`
- [ ] Full file tree preserved (extension/lib/, ui/components/, ui/lib/, ui/styles/, auth callback HTML)
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-009): complete Step N — description`
- **Bug fixes:** `fix(SERO-009): description`

## Do NOT

- Remove the source package from the monorepo
- Modify monorepo files
- Drop the `spotify-auth-callback.html` or `extension/lib/` directory
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
