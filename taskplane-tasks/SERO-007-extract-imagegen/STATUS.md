# SERO-007: Extract pi-imagegen-extension to Plugin — Status

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
- [ ] Catalogued all `@sero/ui` imports (ScrollArea, Button, Popover, cn)
- [ ] Read source of each @sero/ui component for dep requirements
- [ ] Reference plugin exists

---

### Step 1: Scaffold Plugin Repo
**Status:** ⬜ Not Started

- [ ] Create plugin directory and copy source files
- [ ] Inline shadcn components (button, scroll-area, popover) into ui/components/ui/
- [ ] Inline cn utility into ui/lib/utils.ts
- [ ] Replace all @sero/ui imports with relative paths
- [ ] Add Radix UI + utility dependencies
- [ ] Create package.json with plugin metadata
- [ ] Create tsconfig files and update vite.config.ts

---

### Step 2: Install, Build & Verify
**Status:** ⬜ Not Started

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes
- [ ] No @sero/ui references in output
- [ ] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** ⬜ Not Started

- [ ] README.md created
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
