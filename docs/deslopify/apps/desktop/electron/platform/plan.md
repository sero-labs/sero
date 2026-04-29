# Refactoring Plan — apps/desktop/electron/platform

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/platform` is compact and generally well-factored, but it carries one material security debt (overly permissive CSP in production) plus two lifecycle/maintenance drifts around extension-asset registration and duplicated package-detection logic. The plan tightens runtime security first, then reduces drift in platform discovery/protocol contracts.

## Issues Found (prioritized)
- **High** — ~~CSP is broader than necessary in production — `apps/desktop/electron/platform/security/csp.ts:37` includes `'unsafe-inline'` for scripts unconditionally, and `frame-src`/`child-src` allow global `http:` + `https:` (`csp.ts:99-111`) across environments. This weakens renderer containment and increases XSS blast radius if an injection path appears.~~ ✅ 2026-04-16 (`3bcc0170`) Effort: **M**.

- **Medium** — ~~Extension protocol registry is add-only with no uninstall symmetry — manifests are inserted via `registerExtAssets`/`registerAllExtAssets` (`apps/desktop/electron/platform/protocols/ext-protocol.ts:24-32`) and consumed in protocol handling (`ext-protocol.ts:89`), but there is no remove API while plugin install currently registers on install (`apps/desktop/electron/features/plugins/manager.ts:311`). This can leave stale entries until restart.~~ ✅ 2026-04-16 (`3bcc0170`) Effort: **S**.

- **Medium** — ~~Builtin package detection rules are duplicated between runtime and build scripts — `apps/desktop/electron/platform/protocols/builtin-resources.ts:31-44` and `apps/desktop/scripts/build-electron.mjs:35-48` contain mirrored `isBuiltinPackageDir` logic with manual sync comments. Drift here causes packaged-vs-dev discovery mismatch.~~ ✅ 2026-04-16 (`3bcc0170`) Effort: **S**.

- **Low** — ~~Environment bootstrap uses synchronous migration/registry IO during module init — `apps/desktop/electron/platform/env/index.ts:43-53,118-130` runs profile resolution and registry reads at import time. It works today, but raises startup coupling and test harness complexity.~~ ✅ 2026-04-16 (`3bcc0170`) Effort: **M**.

## Proposed Refactoring
1. **Tighten CSP by environment and feature need.**
   - Gate `script-src 'unsafe-inline'` behind explicit dev mode or nonce/hash-protected production bootstrap scripts.
   - Restrict `frame-src`/`child-src` to the minimum required for sandboxed preview flows (e.g., explicit preview origins or route-aware policy decisions).
   - Add tests/snapshots for dev vs prod CSP strings so future policy broadening is intentional.

2. **Add protocol registry lifecycle symmetry.**
   - Introduce `unregisterExtAssets(appId)` (and optional bulk remove) in `ext-protocol.ts`.
   - Call it from plugin uninstall and rollback paths to keep registry state aligned with current install set.
   - Aligns with plugin lifecycle boundaries and avoids stale protocol mappings.

3. **Unify builtin package detection in a single shared helper.**
   - Move `isBuiltinPackageDir` to one canonical module consumed by both runtime discovery and `build-electron.mjs`.
   - Keep behavior identical while eliminating manual copy-sync comments.

4. **Make env resolution side effects more explicit.**
   - Keep existing semantics (must execute before SDK imports), but isolate migration/registry repair in a named bootstrap function and reduce module-top execution.
   - Preserve `loadSeroEnv()` ordering guarantees while making startup state easier to test.

## Benefits & Trade-offs
- Benefits: stronger production security posture, fewer stale plugin protocol mappings, and less packaged/dev drift in builtin discovery.
- Trade-offs: CSP tightening can surface hidden dependencies (inline scripts/preview scenarios), requiring coordination with renderer/bootstrap code.

## Dependencies & Risks
- CSP changes may require updating `apps/desktop/index.html` bootstrap behavior and any preview iframe assumptions.
- Registry lifecycle fixes depend on plugin manager uninstall/rollback flow updates being landed together.
- Shared detection helper extraction touches build tooling and runtime paths, so both dev and packaged builds must be validated.

## Next Steps
1. None — folder plan fully executed 2026-04-16.

## Execution log
- 2026-04-16 — `3bcc0170` `refactor(desktop-platform): harden CSP and protocol lifecycle`
