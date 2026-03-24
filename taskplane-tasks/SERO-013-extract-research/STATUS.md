# SERO-013: Extract pi-research-extension to Plugin — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-03-24
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Source package exists at `packages/pi-research-extension`
- [ ] Confirm no @sero-ai/ui component imports
- [ ] Confirm styles.css @source monorepo reference
- [ ] Verify skills/research/SKILL.md exists
- [ ] Note pi.skills and pi.extensions fields
- [ ] Note pi-agent-core peer dep
- [ ] Reference todo plugin exists

---

### Step 1: Scaffold Plugin Repo
**Status:** ⬜ Not Started

- [ ] Create plugin directory and copy all source files including skills/
- [ ] Fix styles.css — remove monorepo @source path
- [ ] Create package.json with plugin metadata (pinned versions, no catalog:/workspace:)
- [ ] Create tsconfig.extension.json
- [ ] Update vite.config.ts for standalone build

---

### Step 2: Install, Build & Verify
**Status:** ⬜ Not Started

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes (zero errors)
- [ ] No @sero-ai/ui references remain
- [ ] No catalog:/workspace: references remain
- [ ] skills/ directory present
- [ ] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** ⬜ Not Started

- [ ] README.md created
- [ ] .gitignore created
- [ ] Git repo initialized with initial commit

---

### Step 4: Documentation & Delivery
**Status:** ⬜ Not Started

- [ ] Discoveries logged
- [ ] `.DONE` created

---

## Reviews

| # | Type | Step | Verdict | File |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-24 | Task staged | PROMPT.md and STATUS.md created |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
