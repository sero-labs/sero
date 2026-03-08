# Multi-Profile System — Progress Log

## Session 1 — Full Implementation

**Date:** 2026-03-08

### All Phases Complete ✅

### Phase 1: Profile Registry & Manager ✅
- [x] `electron/profile/types.ts` — ProfileEntry, ProfileRegistry, ProfileInfo types
- [x] `electron/profile/manager.ts` — ProfileManager class (CRUD, active, singleton)
- [x] `electron/profile/migration.ts` — Auto-migration for existing users
- [x] `electron/env.ts` — Resolves SERO_HOME from active profile

### Phase 2: IPC Layer ✅
- [x] `electron/ipc/profiles.ts` — IPC handlers (list, getActive, hasActive, create, switch, rename, delete, pickFolder)
- [x] `src/types/ipc-channels.ts` — Added `profiles` channel group
- [x] `src/types/ipc.ts` — Added ProfileInfo type
- [x] `electron/preload.ts` — Added `window.sero.profiles` bridge
- [x] `src/types/electron.d.ts` — Added SeroProfilesAPI interface
- [x] `electron/ipc/index.ts` — Registered profile handlers

### Phase 3: Profile Setup Screen ✅
- [x] `src/stores/profiles.ts` — Profile state store with startup hydration
- [x] `src/components/profiles/ProfileSetup.tsx` — First-run setup screen
- [x] `src/components/profiles/ProfileForm.tsx` — Shared form component
- [x] `src/App.tsx` — Profile gate: shows setup if no active profile

### Phase 4: Profile Switcher UI ✅
- [x] `src/components/profiles/ProfileSwitcher.tsx` — TitleBar dropdown
- [x] `src/components/profiles/CreateProfileDialog.tsx` — New profile dialog
- [x] `src/components/layout/TitleBar.tsx` — Integrated ProfileSwitcher

### Phase 5: localStorage Scoping ✅
- [x] `src/lib/profile-storage.ts` — Profile-prefixed storage helpers
- [x] `src/stores/workspace.ts` — Uses profile-scoped storage
- [x] `src/stores/sessions.ts` — Uses profile-scoped storage
- [x] `src/stores/app.ts` — Uses profile-scoped storage
- [x] Legacy key auto-migration on first read

### Phase 6: Electron userData Isolation ✅
- [x] `electron/main.ts` — Per-profile Chromium userData via `app.setPath()`

### Phase 7: Documentation ✅
- [x] `docs/profiles.md` — User-facing documentation
- [x] `docs/decisions.md` — AD-022: Multi-Profile Architecture
- [x] Full monorepo typecheck passes (22/22 packages)
- [x] All new files under 500 LOC

### Files Created (13)
- `electron/profile/types.ts` (50 lines)
- `electron/profile/manager.ts` (211 lines)
- `electron/profile/migration.ts` (66 lines)
- `electron/ipc/profiles.ts` (90 lines)
- `src/stores/profiles.ts` (148 lines)
- `src/lib/profile-storage.ts` (89 lines)
- `src/components/profiles/ProfileSetup.tsx` (46 lines)
- `src/components/profiles/ProfileForm.tsx` (137 lines)
- `src/components/profiles/ProfileSwitcher.tsx` (113 lines)
- `src/components/profiles/CreateProfileDialog.tsx` (96 lines)
- `docs/profiles.md`
- `docs/profiles/task_plan.md`
- `docs/profiles/findings.md`

### Files Modified (10)
- `electron/env.ts` — Profile-aware SERO_HOME resolution
- `electron/main.ts` — Per-profile userData, imports ACTIVE_PROFILE_ID
- `electron/preload.ts` — Added profiles bridge (+20 lines)
- `electron/ipc/index.ts` — Register profile handlers
- `src/types/ipc.ts` — Added ProfileInfo type (+16 lines)
- `src/types/ipc-channels.ts` — Added profiles channels
- `src/types/electron.d.ts` — Added SeroProfilesAPI + ProfileInfo import
- `src/App.tsx` — Profile store integration + setup gate
- `src/stores/workspace.ts` — Profile-scoped localStorage
- `src/stores/sessions.ts` — Profile-scoped localStorage
- `src/stores/app.ts` — Profile-scoped localStorage/sessionStorage
- `src/components/layout/TitleBar.tsx` — ProfileSwitcher integration
- `docs/decisions.md` — AD-022
