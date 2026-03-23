# Task: SERO-004 - Extract pi-notes-extension to Plugin

**Created:** 2026-03-23
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Multi-file UI (3 components) but no extra deps beyond typebox. No `@sero-ai/ui` usage. Clean extraction.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-004-extract-notes/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-notes-extension` from the Sero monorepo into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-notes-plugin`, renamed to `@sero-ai/plugin-notes`. Follows the reference todo plugin structure. This is a `scope: "global"` app (state is per-user, not per-workspace).

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
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/tsconfig.extension.json`

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-notes-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-notes-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-notes-extension`
- [ ] Verify no `@sero-ai/ui` imports in the source
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/`, `shared/`, `ui/` (including `NoteEditor.tsx`, `NoteList.tsx`, `NotesApp.tsx`, `styles.ts`), `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-notes`:
  - Pin all `catalog:` refs, replace `workspace:` refs with npm versions
  - Add `sero.plugin` metadata (category: `productivity`, tags: `["notes", "writing", "notebook"]`)
  - Preserve `scope: "global"` in `sero.app`
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs
- [ ] Update `vite.config.ts` for standalone build

**Artifacts:**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-notes-plugin/*` (new)

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
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
**Check If Affected:** (none)

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-notes`
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-004): complete Step N — description`
- **Bug fixes:** `fix(SERO-004): description`

## Do NOT

- Remove the source package from the monorepo
- Modify monorepo files
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
