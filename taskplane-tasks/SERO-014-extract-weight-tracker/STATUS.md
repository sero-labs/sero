# SERO-014: Extract pi-weight-tracker to Plugin — Status

**Current Step:** Step 0: Preflight
**Status:** 🟡 In Progress
**Last Updated:** 2026-03-24
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 1
**Size:** S

---

### Step 0: Preflight
**Status:** 🟨 In Progress

- [ ] Source package exists
- [ ] Confirm no @sero-ai/ui imports
- [ ] Confirm no skills directory
- [ ] Note scope: "global" in manifest
- [ ] Note inline styles (no CSS file)
- [ ] Reference todo plugin exists

---

### Step 1: Scaffold Plugin Repo
**Status:** 🟨 In Progress

- [ ] Create plugin directory and copy all source files
- [ ] Create package.json with plugin metadata (pinned versions, preserve scope: "global")
- [ ] Create tsconfig.extension.json
- [ ] Update vite.config.ts for standalone build

---

### Step 2: Install, Build & Verify
**Status:** 🟨 In Progress

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes (zero errors)
- [ ] No catalog:/workspace: references remain
- [ ] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** 🟨 In Progress

- [ ] README.md created
- [ ] .gitignore created
- [ ] Git repo initialized with initial commit

---

### Step 4: Documentation & Delivery
**Status:** 🟨 In Progress

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
| 2026-03-24 23:38 | Task started | Extension-driven execution |
| 2026-03-24 23:38 | Step 0 started | Preflight |
| 2026-03-24 23:38 | Step 1 started | Scaffold Plugin Repo |
| 2026-03-24 23:38 | Step 2 started | Install, Build & Verify |
| 2026-03-24 23:38 | Step 3 started | Create README & Git Init |
| 2026-03-24 23:38 | Step 4 started | Documentation & Delivery |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
