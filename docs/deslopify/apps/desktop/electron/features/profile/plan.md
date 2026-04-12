# Refactoring Plan — apps/desktop/electron/features/profile

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/profile` is foundational AD-022 infrastructure and is mostly well-contained, but it has one serious safety gap and two important contract drifts. The serious gap is registry corruption handling: malformed `profiles.json` currently collapses to “no profiles,” which can send the app down the first-run path and eventually overwrite the registry. The best outcome is a safer registry boundary, one canonical profile contract, and stricter path validation so profile isolation remains trustworthy.

## Issues Found (prioritized)
- **High** — Corrupt or malformed `profiles.json` is treated as an empty registry — `apps/desktop/electron/features/profile/manager.ts:38-46` returns `emptyRegistry()` for parse/shape failures. In an AD-022 system where registry content decides whether any profile exists, this makes corruption indistinguishable from “fresh install” and creates a path to accidental clobber on the next write. Effort: **S**.

- **Medium** — `ProfileInfo` is still duplicated with a `KEEP IN SYNC` warning instead of a canonical contract — `apps/desktop/electron/features/profile/types.ts:39-50` mirrors `apps/desktop/src/types/ipc.ts:16-25`. This is exactly the kind of renderer↔main type drift Sero wants to avoid. Effort: **S**.

- **Medium** — `ProfileManager.create()` does not validate custom paths strongly enough for profile isolation — `apps/desktop/electron/features/profile/manager.ts:121-149` accepts an arbitrary resolved path, and the only collision logic in `defaultPathForName()` (`apps/desktop/electron/features/profile/manager.ts:198-213`) applies to generated defaults. A user can point multiple profiles at the same directory or create overlapping profile roots, which undermines AD-022’s “profile = independent SERO_HOME” guarantee. Effort: **M**.

- **Low** — Copy/setup helpers still rely on broad best-effort catches and carry small dead surface — `apps/desktop/electron/features/profile/copy-profile-data.ts:93-123` suppresses model-preference-copy failures entirely, and `apps/desktop/electron/features/profile/manager.ts:51-54` keeps an unused `writeRegistrySync()` helper. Effort: **S**.

## Proposed Refactoring
1. **Harden registry reads into an explicit safe boundary.**
   - Replace “invalid registry => empty registry” with a result-shaped read that distinguishes:
     - missing registry
     - valid registry
     - malformed/corrupt registry
   - For malformed registries, fail closed with an actionable error path (or quarantine/backup the bad file) instead of silently behaving like first run.
   - This is the highest-value fix because it protects the root AD-022 contract.

2. **Collapse profile contracts to one canonical type source.**
   - Move `ProfileInfo` into the canonical IPC/shared contract location and import it from both renderer and Electron profile code.
   - Delete the `KEEP IN SYNC` comment and the duplicate interface once consumers compile against the shared source.

3. **Validate profile paths before creating registry entries.**
   - Reject custom paths that already belong to another registered profile.
   - Reject paths that nest inside another profile root or that would contain another registered profile root.
   - Consider rejecting obviously dangerous roots (for example the fixed registry root for non-default profiles unless the default profile case is explicit).

4. **Tighten best-effort copy/setup helpers.**
   - Keep profile creation resilient, but log or return structured warnings when credential/model copy partially fails.
   - Remove dead helpers like the unused synchronous writer if they are no longer part of the real bootstrap strategy.

## Benefits & Trade-offs
- Benefits: safer profile-registry handling, less chance of losing or mis-scoping profiles, stronger renderer↔main type guarantees, and better confidence that each profile really is its own `SERO_HOME`.
- Trade-offs: path validation can reject configurations that previously slipped through, and malformed-registry handling may require a new recovery UI or startup error path.

## Dependencies & Risks
- Registry hardening affects `platform/env/index.ts` startup behavior, so the failure mode must be designed carefully before implementation.
- Canonical type extraction touches both renderer and main-process imports.
- Path-validation changes are behavior-sensitive: if existing users already have overlapping custom paths, migration/recovery strategy must be explicit.

## Next Steps
1. Fix the High issue first: distinguish malformed registry content from “no registry yet.”
2. Extract `ProfileInfo` to one canonical contract shared by renderer + main.
3. Add path-collision / path-overlap validation to `ProfileManager.create()`.
4. Tighten copy/setup diagnostics and remove dead helper surface.
5. Verification checklist:
   - Fresh install still shows `ProfileSetup` when no registry exists.
   - Existing valid registries load unchanged.
   - Malformed `profiles.json` no longer routes silently into the first-run path.
   - Creating custom-path profiles rejects duplicate or overlapping roots.
   - Copying credentials/model preferences still works for the happy path and reports partial-copy failure cleanly.
