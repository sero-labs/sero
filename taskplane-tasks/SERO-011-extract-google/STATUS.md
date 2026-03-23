# SERO-011: Extract pi-google-extension to Plugin — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-03-23
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Source package exists
- [ ] Confirmed @sero/ui has zero actual imports
- [ ] Inventoried extension files (gogcli.ts)
- [ ] Noted dual typecheck + lucide-react
- [ ] Reference plugin exists

---

### Step 1: Scaffold Plugin Repo
**Status:** ⬜ Not Started

- [ ] Create plugin directory and copy full file tree
- [ ] Create package.json (drop @sero/ui, keep lucide-react, dual typecheck)
- [ ] Create tsconfig files and update vite.config.ts

---

### Step 2: Install, Build & Verify
**Status:** ⬜ Not Started

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes (both UI and extension)
- [ ] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** ⬜ Not Started

- [ ] README.md created (with gogcli + OAuth docs)
- [ ] .gitignore created
- [ ] Git repo initialized

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
| 2026-03-23 | Task staged | PROMPT.md and STATUS.md created |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
