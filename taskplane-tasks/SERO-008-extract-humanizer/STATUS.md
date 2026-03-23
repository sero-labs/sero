# SERO-008: Extract pi-humanizer-extension to Plugin — Status

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
- [ ] Catalogued all @sero-ai/ui imports (6 components + cn)
- [ ] Read component sources for Radix dep requirements
- [ ] Verified skills/ directory
- [ ] Noted streamdown + pi.skills field
- [ ] Reference plugin exists

---

### Step 1: Scaffold Plugin Repo
**Status:** ⬜ Not Started

- [ ] Create plugin directory and copy all source files including skills/
- [ ] Inline 6 shadcn components into ui/components/ui/
- [ ] Inline cn utility
- [ ] Replace all @sero-ai/ui imports with relative paths
- [ ] Add Radix UI + utility deps
- [ ] Create package.json with plugin metadata (preserve pi.skills)
- [ ] Create tsconfig files and update vite.config.ts

---

### Step 2: Install, Build & Verify
**Status:** ⬜ Not Started

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes
- [ ] No @sero-ai/ui references remain
- [ ] skills/ directory present
- [ ] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** ⬜ Not Started

- [ ] README.md created (with skill docs)
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
