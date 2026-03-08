# Multi-Profile System — Task Plan

**Goal:** Allow multiple independent user profiles in Sero, each with completely
isolated state (workspaces, sessions, auth, config, app data). Profiles map to
independent `SERO_HOME` directories anywhere on the filesystem. Profile name
is independent of folder name.

**Status:** Planning

---

## Architecture Overview

```
~/.sero-ui/                        ← Profile root (still the default)
├── profiles.json                  ← Profile registry (NEW — lives OUTSIDE any profile)
├── agent/                         ← Profile-specific agent dir
│   ├── auth.json
│   ├── settings.json
│   ├── sessions/
│   ├── workspaces.json
│   ├── layout.json
│   └── ...
└── workspaces/
    └── global/

/Users/dan/work-profile/           ← Another profile (arbitrary path)
├── agent/
│   ├── auth.json
│   ├── settings.json
│   ├── sessions/
│   ├── workspaces.json
│   ├── layout.json
│   └── ...
└── workspaces/
    └── global/
```

### Key Design Decisions

1. **Profile registry lives at a fixed path:** `~/.sero-ui/profiles.json`
   - This is the ONE fixed location Sero always reads on startup
   - Contains: `{ profiles: [...], activeProfileId: "..." }`
   - Each profile entry: `{ id, name, path, createdAt }`
   - `name` is display-only, independent of folder name

2. **Profile = SERO_HOME directory:**
   - Switching profiles changes `SERO_HOME` and `SERO_AGENT_DIR`
   - Everything downstream (workspaces, sessions, auth, apps, layout) resolves from these
   - Fully leverages existing architecture — no restructuring needed

3. **App restart on switch:**
   - Switching profiles triggers `app.relaunch()` + `app.exit()`
   - The active profile ID is persisted in `profiles.json`, read on next launch
   - Clean slate — no stale singletons, no partial state

4. **First-run flow:**
   - If `profiles.json` doesn't exist OR has no profiles → show setup screen
   - User creates their first profile (name + optional path)
   - Default path: `~/.sero-ui/` (existing users get migrated seamlessly)

5. **Migration for existing users:**
   - If `~/.sero-ui/` exists but `profiles.json` doesn't → auto-create a
     "Default" profile pointing to `~/.sero-ui/` → no data loss, zero friction

---

## Phases

### Phase 1: Profile Registry & Manager (Electron) `[status: not_started]`

Create the core profile management layer in the Electron main process.

**Files to create:**
- `electron/profile/types.ts` — Profile, ProfileRegistry types
- `electron/profile/manager.ts` — ProfileManager class (CRUD, active profile)
- `electron/profile/migration.ts` — Auto-migration for existing users

**Files to modify:**
- `electron/env.ts` — Add `loadActiveProfile()` that reads profiles.json
  and sets SERO_HOME/SERO_AGENT_DIR before anything else

**Deliverables:**
- [x] ProfileManager can create/list/delete/switch profiles
- [x] ProfileManager reads from `~/.sero-ui/profiles.json`
- [x] Migration: existing `~/.sero-ui/` auto-enrolled as "Default" profile
- [x] `env.ts` resolves SERO_HOME from active profile on startup

### Phase 2: IPC Layer for Profiles `[status: not_started]`

Expose profile operations to the renderer via IPC.

**Files to create:**
- `electron/ipc/profiles.ts` — IPC handlers for profile CRUD + switch

**Files to modify:**
- `src/types/ipc-channels.ts` — Add `profiles` channel group
- `src/types/ipc.ts` — Add ProfileInfo, ProfileRegistry types
- `electron/preload.ts` — Add `window.sero.profiles` bridge
- `src/types/electron.d.ts` — Type the new bridge
- `electron/ipc/index.ts` — Register profile handlers

**Deliverables:**
- [ ] `window.sero.profiles.list()` — get all profiles
- [ ] `window.sero.profiles.getActive()` — get current profile
- [ ] `window.sero.profiles.create(name, path?)` — create new profile
- [ ] `window.sero.profiles.switch(id)` — switch + relaunch
- [ ] `window.sero.profiles.delete(id)` — delete profile (not files)
- [ ] `window.sero.profiles.rename(id, name)` — rename display name
- [ ] `window.sero.profiles.pickFolder()` — native folder picker for custom path

### Phase 3: Profile Setup Screen (First Run) `[status: not_started]`

Full-screen UI shown when no profile exists (first run or fresh install).

**Files to create:**
- `src/components/profiles/ProfileSetup.tsx` — First-run setup wizard
- `src/components/profiles/ProfileForm.tsx` — Shared form (name + path picker)
- `src/stores/profiles.ts` — Profile state store

**Files to modify:**
- `src/App.tsx` — Gate on profile state: show ProfileSetup if no active profile
- `electron/main.ts` — Send profile state to renderer on window load

**Deliverables:**
- [ ] Clean setup screen with Sero branding
- [ ] Name input + optional custom path picker
- [ ] "Create Profile" button → creates profile + continues to app
- [ ] Existing users skip this entirely (auto-migration in Phase 1)

### Phase 4: Profile Switcher UI `[status: not_started]`

UI to show current profile and switch between them.

**Files to create:**
- `src/components/profiles/ProfileSwitcher.tsx` — Dropdown/popover in TitleBar
- `src/components/profiles/ProfileBadge.tsx` — Current profile indicator
- `src/components/profiles/CreateProfileDialog.tsx` — Dialog for creating new profiles

**Files to modify:**
- `src/components/layout/TitleBar.tsx` — Add ProfileBadge/Switcher
- `src/stores/profiles.ts` — Hydration from IPC on startup

**Deliverables:**
- [ ] Profile badge in TitleBar showing current profile name
- [ ] Click opens switcher with all profiles
- [ ] Switch triggers app restart with confirmation
- [ ] "New Profile" option in switcher opens creation dialog
- [ ] "Manage Profiles" link (rename/delete)

### Phase 5: localStorage Scoping `[status: not_started]`

localStorage keys must be scoped per profile to prevent cross-contamination.

**Files to modify:**
- `src/stores/workspace.ts` — Prefix localStorage keys with profile ID
- `src/stores/sessions.ts` — Prefix localStorage keys with profile ID
- `src/stores/app.ts` — Prefix localStorage/sessionStorage keys with profile ID

**Deliverables:**
- [ ] All localStorage keys prefixed: `sero:${profileId}:...`
- [ ] On profile switch, only the active profile's keys are read
- [ ] Old un-prefixed keys migrated on first load

### Phase 6: Electron userData Isolation `[status: not_started]`

Chromium's userData (cookies, storage, cache) should be per-profile.

**Files to modify:**
- `electron/main.ts` — Set `app.setPath('userData', ...)` based on active profile

**Deliverables:**
- [ ] Each profile gets its own Chromium userData directory
- [ ] Prevents session/cookie leakage between profiles

### Phase 7: Documentation & Testing `[status: not_started]`

**Files to create:**
- `docs/profiles.md` — User-facing documentation
- `docs/decisions.md` — AD-022: Multi-Profile Architecture

**Deliverables:**
- [ ] Architecture decision documented
- [ ] User guide written
- [ ] Typecheck passes
- [ ] Manual E2E testing checklist

---

## Data Flow

### Startup Sequence (with profiles)

```
1. electron/env.ts: loadActiveProfile()
   ├── Read ~/.sero-ui/profiles.json
   ├── Find active profile entry
   ├── Set SERO_HOME = profile.path
   ├── Set SERO_AGENT_DIR = profile.path + '/agent'
   └── Set PI_CODING_AGENT_DIR = SERO_AGENT_DIR

2. electron/main.ts: app.whenReady()
   ├── bootstrapAgentDir() (uses SERO_AGENT_DIR)
   ├── workspaceManager.init() (uses SERO_HOME)
   └── ... normal startup

3. Renderer: App.tsx
   ├── Check profiles.hasActiveProfile via IPC
   ├── If no profile → show ProfileSetup
   └── If profile exists → normal app render
```

### Profile Switch Sequence

```
1. User clicks profile in switcher
2. Renderer: window.sero.profiles.switch(targetId)
3. Main: ProfileManager.setActive(targetId) → writes profiles.json
4. Main: app.relaunch() + app.exit()
5. New process: env.ts reads updated profiles.json → new SERO_HOME
6. Normal startup with new profile's data
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Auto-migration is read-only; only creates profiles.json |
| Stale singletons after switch | App restart ensures clean slate |
| localStorage cross-contamination | Profile-prefixed keys (Phase 5) |
| Electron userData leakage | Per-profile userData path (Phase 6) |
| Broken first-run experience | Existing `~/.sero-ui/` auto-enrolled silently |

---

## Files Inventory (all phases)

### New files
- `electron/profile/types.ts`
- `electron/profile/manager.ts`
- `electron/profile/migration.ts`
- `electron/ipc/profiles.ts`
- `src/components/profiles/ProfileSetup.tsx`
- `src/components/profiles/ProfileForm.tsx`
- `src/components/profiles/ProfileSwitcher.tsx`
- `src/components/profiles/ProfileBadge.tsx`
- `src/components/profiles/CreateProfileDialog.tsx`
- `src/stores/profiles.ts`
- `docs/profiles.md`

### Modified files
- `electron/env.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `electron/ipc/index.ts`
- `src/types/ipc.ts`
- `src/types/ipc-channels.ts`
- `src/types/electron.d.ts`
- `src/App.tsx`
- `src/components/layout/TitleBar.tsx`
- `src/stores/workspace.ts`
- `src/stores/sessions.ts`
- `src/stores/app.ts`
- `docs/decisions.md`
