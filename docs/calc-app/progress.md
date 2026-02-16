# Progress: Auto-Discovery Refactor

## Phase 1: Add `devPort` to all package manifests
- [x] pi-todo-extension: devPort 5174
- [x] pi-weight-tracker: devPort 5176
- [x] pi-daily-quote: devPort 5177
- [x] pi-calc-extension: devPort 5175

## Phase 2: Auto-discover remotes in `vite.config.ts`
- [x] `discoverSeroApps()` scans packages/pi-*/package.json
- [x] Builds MF remotes map dynamically from manifests
- [x] Removed all hardcoded remote entries
- [x] Auto-generates `src/types/module-federation.d.ts`

## Phase 3: Replace static federation registry with `loadRemote()`
- [x] Rewrote `federation-registry.ts` to use `loadRemote` dynamically
- [x] Updated `SeroAppMount` to pass `manifest.component`
- [x] No per-app imports needed anymore

## Phase 4: Auto-discover packages in `electron/main.ts`
- [x] `getBuiltinPackagePaths()` scans packages dir
- [x] Removed hardcoded paths from `ensureBuiltinPackages()` and `registerAppPath()`

## Phase 5: Make `dev.sh` dynamic
- [x] Rewrote to discover packages and loop over them
- [x] Ports, PIDs, readiness checks all automatic

## Phase 6: Verify
- [x] Typecheck passes
- [x] All files under 500 LOC
