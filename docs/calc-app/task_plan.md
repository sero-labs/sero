# Task: Create sero-calc-pi Calculator App

## Goal
Build a modern calculator Sero app (`sero-calc-pi`) styled like iOS/Android calculators, following the apps tutorial step by step. Document the process to refine app-building workflows.

## Phases

### Phase 1: Create the Package — `packages/pi-calc-extension/`
- [x] `package.json` (dual Pi + Sero manifest)
- [x] `shared/types.ts` (CalcState shape)
- [x] `extension/index.ts` (Pi tool: evaluate, clear, history)
- [x] `ui/CalcApp.tsx` (modern calculator UI)
- [x] `ui/tsconfig.json`
- [x] `ui/index.html`
- [x] `vite.config.ts`
Status: complete

### Phase 2: Register in Sero Host
- [x] `apps/desktop/vite.config.ts` — add remote
- [x] `apps/desktop/src/types/module-federation.d.ts` — type declaration
- [x] `apps/desktop/src/lib/federation-registry.ts` — lazy component
- [x] `apps/desktop/electron/main.ts` — dev discovery path + ensureBuiltinPackages
- [x] `apps/desktop/scripts/dev.sh` — start remote dev server
Status: complete

### Phase 3: Install & Verify
- [x] `pnpm install` — resolved cleanly, already up to date
- [x] Typecheck — both package and host pass with zero errors
- [x] All files under 500 LOC limit
Status: complete

## Port Assignment
- Port 5175 (next available after 5174=todo, 5176=weight, 5177=quote)

## Decisions
- App ID: `calc`
- MF remote name: `sero_calc`
- State file: `.sero/apps/calc/state.json`
- Component: `CalcApp`
- Package dir: `packages/pi-calc-extension/`
