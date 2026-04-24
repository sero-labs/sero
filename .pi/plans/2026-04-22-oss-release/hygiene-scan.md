# OSS Alpha Hygiene Scan

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/review.md`

## Secret scanning

### Working tree
- Command: `gitleaks dir . --config .gitleaks.toml --no-banner --exit-code 0`
- Result: **clean**
- Findings: `0`

### Git history
- Command: `gitleaks git . --log-opts="--all" --config .gitleaks.toml --no-banner --exit-code 0`
- Result: **clean**
- Findings: `0`
- Notes: scanned `960` commits with no leaks found

## Path / machine-specific reference scan

A focused repo reconnaissance was run against public-facing docs and release
surfaces for:
- `/Users/...`
- `/var/folders/...`
- `~/.pi/agent`
- `~/.sero-ui`
- personal-email references

## Key findings

### Non-blocking cleanup items
1. Public-facing maintainer contact references still exist in:
   - `SECURITY.md`
   - `CODE_OF_CONDUCT.md`
2. Some docs/examples still contain illustrative absolute paths such as:
   - `/Users/you/...`
   - `/Users/dan/...`
3. A few docs/examples still mention `~/.pi/agent`, which conflicts with
   Sero's public `~/.sero-ui/agent` direction.

### Good news
- Runtime implementation paths are consistently aligned to `SERO_HOME` /
  `SERO_AGENT_DIR` and the `~/.sero-ui` model.
- Most hardcoded personal paths are concentrated in tests, local artifacts, or
  historical/internal materials rather than the active runtime path.

## Current assessment
- **No blocker** found for proceeding with the OSS alpha foundation work.
- Later sanitization should:
  - replace personal-email references if a role account or alias becomes
    available
  - normalize lingering `~/.pi/agent` examples where the context is
    Sero-specific
  - trim or sanitize illustrative `/Users/...` examples in public docs where
    they read as normative rather than illustrative
