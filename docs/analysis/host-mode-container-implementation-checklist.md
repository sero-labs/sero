# Host-Mode Support — Implementation Checklist

**Date:** 2026-04-17  
**Related analysis:** `docs/analysis/host-mode-container-support.md`

This is the concrete implementation checklist for moving Sero from a **"containers are a hard requirement"** story to a **"containers are strongly recommended, host mode is a supported fallback"** story.

It also includes the requested onboarding work:

> Show a missing-containers warning in `OnboardingWizard` with a link to container setup instructions.

---

## 1. Recommended implementation shape

### Preferred design

Do **not** model missing containers as just another generic onboarding warning string.

Instead, add a small, explicit runtime status object to onboarding state, e.g.:

```ts
interface OnboardingContainerRuntime {
  status: 'available' | 'missing_binary' | 'system_unavailable' | 'startup_failed';
  message: string;
  recommended: boolean;
  docsUrl?: string;
}
```

Then render a dedicated onboarding banner / callout when:
- `status !== 'available'`

### Why this is better than a plain warning code

Because container availability is not really:
- a provider problem
- a model-selection warning
- a generic recommendation drift warning

It is a **runtime capability state**. Treating it as a first-class runtime signal makes later work easier:
- host-mode feature gating
- global “prefer/off/require” container preferences
- settings / diagnostics screens
- post-onboarding banners outside the onboarding flow

---

## 2. File-by-file checklist

## Progress tracker

Use this checklist to record implementation progress.

### Phase 1 — unblock the requested onboarding warning
- [x] Add `docs/guides/macos-containers.md`
- [x] Add a reusable container availability helper in `apps/desktop/electron/features/container/core/availability.ts`
- [x] Extend onboarding types with `containerRuntime`
- [x] Populate `containerRuntime` in onboarding preflight
- [x] Add shell `openExternal(url)` bridge
- [x] Add `ContainerRuntimeNotice.tsx`
- [x] Render the notice in `OnboardingWizard` ready/auth flows
- [x] Add onboarding warning tests

### Phase 2 — make docs/product messaging truthful
- [x] Update `docs/sero.md` to say containers are strongly recommended, not required
- [x] Document host-mode limitations clearly
- [x] Link to the new macOS containers guide from relevant docs

### Phase 3 — make host fallback behavior more coherent
- [x] Align editor write/exec fallback with read/list fallback
- [x] Add a shared workspace/container runtime resolver
- [x] Improve terminal fallback UX
- [x] Add explicit host-fallback notices when sessions continue without containers

### Phase 4 — propagate runtime diagnostics and remaining fallback consumers
- [x] Reuse availability helper in boot logging where appropriate
- [x] Propagate runtime resolution to subagent runner
- [x] Propagate runtime resolution to VCS/git runner
- [x] Propagate runtime resolution to kanban workspace command runner
- [x] Surface host-vs-container runtime state in settings/diagnostics UI

### Phase 5 — add capability-aware gating and auditing
- [x] Extend runtime resolution with capability-audit details for container-only features
- [x] Surface deeper capability auditing in settings/diagnostics UI
- [x] Add explicit host-mode UX for remaining container-only features (LSP, managed previews, container mounts)
- [x] Extend diagnostics/tests for the new gating paths

### Detailed task checklist
- [x] Create the dedicated container setup guide
- [x] Update product positioning docs
- [x] Add reusable container availability detection
- [x] Reuse availability helper in boot logging where appropriate
- [x] Extend onboarding state contract with container runtime info
- [x] Populate onboarding container runtime in preflight
- [x] Add onboarding preflight tests for container status
- [x] Add a dedicated onboarding runtime banner component
- [x] Show the warning in onboarding ready/auth flows
- [x] Keep provider/model warning UI separate from runtime messaging
- [x] Add external-link support to the shell API
- [x] Decide and wire the canonical instructions URL
- [x] Wire the onboarding CTA to open the instructions link
- [x] Align editor host fallback behavior
- [x] Add a shared runtime resolver
- [x] Propagate runtime resolution to subagent runner
- [x] Propagate runtime resolution to VCS/git runner
- [x] Propagate runtime resolution to kanban workspace command runner
- [x] Improve terminal fallback UX
- [x] Add visible host-fallback notices in sessions
- [x] Surface runtime state in settings/diagnostics UI
- [x] Add deeper capability-audit details to runtime diagnostics
- [x] Add explicit host-mode UX for containerized LSP
- [x] Add explicit host-mode UX for managed preview/dev-server automation
- [x] Add explicit host-mode UX for container mounts/references
- [x] Add renderer/electron tests for runtime capability gating
- [x] Add renderer tests for the onboarding container warning
- [x] Update onboarding launch/runtime tests for the new state shape

### Acceptance checklist
- [x] If Apple containers are unavailable, `OnboardingWizard` shows a non-blocking warning
- [x] The warning says containers are recommended, not required
- [x] The warning links to a container setup guide
- [x] Users can still continue onboarding in host mode
- [x] `docs/sero.md` no longer describes containers as a hard requirement
- [x] There is a canonical container setup guide
- [x] Host-only limitations are documented clearly
- [x] Core host fallback remains non-blocking
- [x] Editor/runtime behavior is more consistent when containers are unavailable
- [x] Users get clear messaging when Sero falls back to host mode
- [x] Container-only features expose explicit host-mode reasons instead of failing silently
- [x] Settings/admin diagnostics show a capability audit for host-vs-container runtime drift

## A. Docs and canonical instructions link

### 1) Create a dedicated container setup guide

**Add:**
- `docs/guides/macos-containers.md`

**Purpose:**
- single canonical instructions page for:
  - Apple Silicon requirement
  - supported macOS version
  - installing Apple’s `container` CLI
  - verifying `/usr/local/bin/container`
  - starting/checking `container system`
  - rebuilding / ensuring `sero-node` image if needed
  - common failure cases and recovery steps
  - what works without containers vs what requires them

**Why:**
- Onboarding needs a stable destination to link to
- current repo docs mention containers in several places, but there is no obvious user-facing setup guide to open from onboarding

### 2) Update product positioning docs

**Modify:**
- `docs/sero.md`

**Changes:**
- replace “Hard requirement: Every agent session is sandboxed inside a container”
- new wording should say containers are **strongly recommended for full functionality**
- mention that Sero can continue in a reduced host mode when containers are unavailable or disabled
- include explicit limitations:
  - browser tool unavailable
  - no containerized LSP
  - reduced managed preview/dev-server automation
  - no Linux parity / container networking semantics

---

## B. Main-process container availability detection

### 3) Add a reusable container availability helper

**Add:**
- `apps/desktop/electron/features/container/core/availability.ts`

**Purpose:**
- centralize machine/runtime checks for container support

**Recommended API shape:**

```ts
export interface ContainerAvailability {
  status: 'available' | 'missing_binary' | 'system_unavailable' | 'startup_failed';
  message: string;
  recommended: boolean;
}

export async function getContainerAvailability(): Promise<ContainerAvailability>
```

**Checks to include:**
- whether `CONTAINER_BIN` exists
- whether container system responds
- optionally whether startup succeeds when attempted
- clear user-facing error/message mapping

**Why:**
- right now container startup logic exists, but the app does not expose a clean diagnostic result to renderer UX
- onboarding needs a stable source of truth rather than guessing from tool failures later

### 4) Reuse availability helper in boot logging where appropriate

**Potential modify:**
- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/features/container/core/lifecycle.ts`

**Goal:**
- keep boot behavior non-blocking
- but make boot/container logs map to the same reason strings the renderer will show

This is optional for the first pass, but recommended to prevent drift between:
- startup logs
- onboarding copy
- later settings/diagnostics UI

---

## C. Onboarding state contract

### 5) Extend onboarding types with container runtime info

**Modify:**
- `apps/desktop/src/types/onboarding.ts`
- `apps/desktop/electron/features/onboarding/types.ts`

**Recommended addition:**

```ts
export interface OnboardingContainerRuntime {
  status: 'available' | 'missing_binary' | 'system_unavailable' | 'startup_failed';
  message: string;
  recommended: boolean;
  docsUrl?: string;
}
```

Add to `OnboardingState`:

```ts
containerRuntime: OnboardingContainerRuntime;
```

Update `emptyOnboardingState()` accordingly.

**Why:**
- keeps the renderer strongly typed
- avoids abusing `warnings[]` for capability state
- makes future reuse straightforward

### 6) Populate container runtime in onboarding preflight

**Modify:**
- `apps/desktop/electron/features/onboarding/preflight.ts`

**Changes:**
- call the new availability helper during onboarding-state construction
- include `containerRuntime` in both:
  - non-onboarded state
  - already-onboarded/done state
- keep onboarding read-only semantics intact for `getOnboardingState()`
- avoid mutating settings or container state just to answer availability

**Important:**
This should remain a **diagnostic read**, not an implicit “start all container infrastructure” side effect.

### 7) Add onboarding preflight tests for container status

**Modify / add tests:**
- `apps/desktop/electron/__tests__/features/onboarding/preflight.test.ts`

**Add coverage for:**
- `missing_binary` → onboarding state contains warning/runtime notice
- `system_unavailable` → onboarding state contains warning/runtime notice
- `available` → no banner required
- malformed settings path still remains non-mutating and error-preserving

---

## D. Renderer onboarding warning UI

### 8) Add a dedicated onboarding runtime banner component

**Add:**
- `apps/desktop/src/components/profiles/onboarding/ContainerRuntimeNotice.tsx`

**Purpose:**
- dedicated reusable callout for the missing/unavailable containers message
- keeps `OnboardingWizard.tsx` and `OnboardingViews.tsx` small

**Suggested UI behavior:**
- title like: `Containers recommended for full Sero features`
- body explains:
  - Sero can continue in host mode
  - some features will be unavailable until containers are configured
- CTA link/button:
  - `Set up macOS containers`
- optional secondary note listing key missing features:
  - browser automation
  - containerized language servers
  - managed preview/dev-server automation

### 9) Show the warning in OnboardingWizard flows

**Modify:**
- `apps/desktop/src/components/profiles/OnboardingWizard.tsx`
- `apps/desktop/src/components/profiles/onboarding/OnboardingViews.tsx`
- possibly `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`

**Recommended rendering behavior:**
- show the container notice in the **ready** screen
- also show it in the **auth** screen, because users with no provider configured still need to see container guidance
- do **not** block onboarding continuation
- do **not** route users to an error state just because containers are missing

**Preferred placement:**
- near the top of the dialog content, above model/provider controls

### 10) Do not overload existing provider/model warning UI for this

**Avoid:**
- adding special cases inside `WarningBanner` in `SetupScreen.tsx`

**Reason:**
- that warning surface is currently model/provider oriented
- the missing-containers message is broader and should also appear in auth/onboarding setup states

---

## E. Link from onboarding to instructions

### 11) Add an external-link bridge to the shell API

**Modify:**
- `apps/desktop/src/types/ipc-channels.ts`
- `apps/desktop/electron/ipc/platform/system/shell.ts`
- `apps/desktop/electron/preload/api/core.ts`
- `apps/desktop/src/types/electron.d.ts`

**Add:**
- `shell.openExternal(url: string): Promise<void>`

**Why this is the cleanest path:**
- onboarding is an Electron modal; it should be able to open the canonical docs directly
- this bridge will also be useful elsewhere for provider setup / docs / diagnostics links

### 12) Decide and wire the canonical instructions URL

**Recommended approach:**
- use a single constant, e.g. `MACOS_CONTAINERS_DOC_URL`
- place it in a shared renderer-safe constants file or onboarding UI constants file

**Link target options:**

#### Preferred
A stable hosted docs URL for the new guide.

#### Acceptable fallback
A repository URL to the markdown file in the default branch.

#### Less preferred
A local filesystem path opened in Finder via `showItemInFolder()`.

That last option is less good because the user asked for a link to instructions, not a folder reveal.

### 13) Add CTA wiring in the onboarding notice

**Modify:**
- `apps/desktop/src/components/profiles/onboarding/ContainerRuntimeNotice.tsx`

**Behavior:**
- clicking `Set up macOS containers` should call `window.sero.shell.openExternal(docsUrl)`
- if `docsUrl` is absent, hide the CTA rather than rendering a dead link

---

## F. Make runtime fallback behavior more consistent

These are not strictly required for the onboarding warning itself, but they are the next logical changes if Sero is going to officially support host mode.

### 14) Align editor write/exec fallback with read/list fallback

**Modify:**
- `apps/desktop/electron/ipc/editor/editor.ts`

**Current issue:**
- `readFile`, `readBinaryFile`, and `listFiles` already fall back to host behavior when no container is running
- `writeFile` and `exec` do not mirror that pattern when the workspace is marked container-enabled but the runtime is unavailable

**Recommended change:**
- use the same runtime resolution logic before choosing container vs host execution

### 15) Add a shared workspace runtime resolver

**Add:**
- `apps/desktop/electron/features/workspace/runtime-resolution.ts`
  or
- `apps/desktop/electron/features/container/runtime-resolution.ts`

**Goal:**
One place decides:
- desired runtime: container vs host
- actual runtime: container vs host
- reason for fallback
- capability flags

**Consumers to migrate incrementally:**
- `agent-session-open.ts`
- `subagent/runtime/runner.ts`
- `ipc/editor/editor.ts`
- `ipc/container/terminal.ts`
- `features/vcs/core/git-runner.ts`
- `features/kanban/workspace/workspace-command-runner.ts`

### 16) Improve terminal fallback UX

**Modify:**
- `apps/desktop/electron/ipc/container/terminal.ts`
- `apps/desktop/src/components/apps/explorer/TerminalTabs.tsx`

**Goal:**
- if containers are configured but unavailable, either:
  - offer an explicit host terminal fallback, or
  - clearly explain that the workspace is still set to container mode and needs to be toggled

### 17) Add visible transcript/system notice when sessions fall back to host tools

**Modify:**
- `apps/desktop/electron/ipc/agent/core/agent-session-open.ts`
- possibly renderer event handling in `apps/desktop/src/stores/agent-utils.ts`

**Goal:**
- when container fallback occurs, tell the user clearly:
  - session is continuing in host mode
  - full container-only functionality is not available

This complements the onboarding warning and avoids silent degradation later.

---

## G. Tests for the onboarding warning UX

### 18) Add renderer tests for onboarding container warning

**Add tests:**
- `apps/desktop/src/components/profiles/OnboardingWizard.test.tsx`
  or
- `apps/desktop/src/components/profiles/onboarding/ContainerRuntimeNotice.test.tsx`

**Recommended coverage:**
- missing containers banner renders when `containerRuntime.status !== 'available'`
- CTA button opens docs link
- banner does not block Continue button
- banner appears in both ready and auth onboarding states
- no banner when containers are available

### 19) Keep launch/runtime tests green with the new state shape

**Modify as needed:**
- `apps/desktop/src/components/profiles/onboarding/onboarding-launch-runtime.test.ts`
- any onboarding-state factories used in tests

Because adding `containerRuntime` to `OnboardingState` will require fixture updates.

---

## 3. Recommended implementation order

## Phase 1 — unblock the requested onboarding warning

1. [x] Add `docs/guides/macos-containers.md`
2. [x] Add container availability helper
3. [x] Extend onboarding state with `containerRuntime`
4. [x] Populate it in onboarding preflight
5. [x] Add shell `openExternal(url)` bridge
6. [x] Add `ContainerRuntimeNotice.tsx`
7. [x] Render it in `OnboardingWizard` ready/auth flows
8. [x] Add tests

This gets the requested user-visible behavior in place quickly.

## Phase 2 — make docs/product messaging truthful

1. [x] Update `docs/sero.md`
2. [x] Add host-mode limitations section
3. [x] Link to the new guide from other relevant docs

## Phase 3 — make host fallback behavior actually coherent

1. [x] Align editor write/exec fallback
2. [x] Add runtime resolver
3. [x] Improve terminal fallback UX
4. [x] Add explicit host-fallback notices in sessions

## Phase 4 — propagate runtime diagnostics and remaining fallback consumers

1. [x] Reuse availability helper in boot logging
2. [x] Propagate runtime resolution to subagent runner
3. [x] Propagate runtime resolution to VCS/git runner
4. [x] Propagate runtime resolution to kanban workspace command runner
5. [x] Surface host-vs-container runtime state in settings/diagnostics UI

## Phase 5 — add capability-aware gating and auditing

1. [x] Extend runtime resolution with capability-audit details for container-only features
2. [x] Surface deeper capability auditing in settings/admin diagnostics UI
3. [x] Add explicit host-mode UX for containerized LSP
4. [x] Add explicit host-mode UX for managed preview/dev-server automation
5. [x] Add explicit host-mode UX for container mounts/references
6. [x] Extend tests for the new gating/auditing paths

---

## 4. Concrete acceptance criteria

The work should be considered complete when all of the following are true:

### Onboarding
- [x] If Apple containers are unavailable, `OnboardingWizard` shows a non-blocking warning
- [x] That warning explicitly says containers are recommended, not required
- [x] The warning links to a container setup guide
- [x] The user can still continue onboarding in host mode

### Documentation
- [x] `docs/sero.md` no longer calls containers a hard requirement
- [x] There is a canonical container setup guide
- [x] Host-only limitations are documented clearly

### Runtime consistency
- [x] Core host fallback remains non-blocking
- [x] Editor/runtime behavior is more consistent when containers are unavailable
- [x] Users get clear messaging when Sero falls back to host mode
- [x] Container-only capabilities expose explicit host-mode reasons instead of silent no-ops
- [x] Runtime diagnostics include a capability audit for container-only features

---

## 5. Notes / trade-offs

### Why not block onboarding when containers are missing?

Because the requested product direction is:
- strongly recommend containers
- do not make them a hard requirement

So the onboarding warning must be:
- visible
- actionable
- informative
- **non-blocking**

### Why prefer a dedicated onboarding container notice over reusing warning banners?

Because it keeps the architecture honest:
- provider/model warnings stay provider/model specific
- runtime capability messaging gets its own UI primitive

### Why add `openExternal()` instead of hardcoding `<a href>` everywhere?

Because it gives a single, explicit Electron-safe path for opening docs and external setup instructions, and is likely to be reused beyond onboarding.
