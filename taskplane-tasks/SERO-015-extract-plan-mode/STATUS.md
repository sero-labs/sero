# SERO-015: Extract pi-plan-mode-extension to Plugin — Status

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

- [ ] Source package exists
- [ ] Confirm no @sero-ai/ui imports
- [ ] Verify skills/plan-exit-review/SKILL.md exists
- [ ] Note shared/utils.ts alongside shared/types.ts
- [ ] Note pi.skills and pi.extensions fields
- [ ] Note pi-agent-core peer dep
- [ ] Note inline styles (no CSS file)
- [ ] Reference todo plugin exists

---

### Step 1: Scaffold Plugin Repo
**Status:** ⬜ Not Started

- [ ] Create plugin directory and copy all source files including skills/ and shared/utils.ts
- [ ] Create package.json with plugin metadata (pinned versions, preserve pi.skills)
- [ ] Create tsconfig.extension.json
- [ ] Update vite.config.ts for standalone build

---

### Step 2: Install, Build & Verify
**Status:** ⬜ Not Started

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes (zero errors)
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
