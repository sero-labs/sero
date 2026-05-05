# Todos: OpenShell Runtime Policy Profiles

**Tag:** `openshell-policy-profiles`  
**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`  
**Spec:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/docs/features/openshell-runtime-proposal-v2.md`

---

## TODO OPENSHELL-POLICY-PROFILES-01 — Add the shared OpenShell policy profile catalog

**Status:** Closed — Added the shared `@sero-ai/common` OpenShell policy profile catalog, exports, and local verification for default lookup/catalog completeness.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
Create the canonical shared profile model for Strict, Dev, Browser Agent, GPU Agent, and Plugin Test. This is the source of truth used by Electron diagnostics, renderer UI, and app-runtime/plugin contracts.

### Constraints
- Put renderer-safe shared types and constants in `packages/common/src/openshell-policy.ts`.
- Export the new module from `packages/common/src/index.ts`.
- Default profile must be `dev`, not `strict`, because current Phase 2.5 behavior is dev-workflow oriented and Sero does not yet apply stricter policy YAML.
- Include filesystem, network, process, static boundary, hot-reloadable boundary, sandbox recreation, and unsupported-current-CLI copy in every profile.
- Do **not** import Electron, Node, React, or desktop renderer modules from `packages/common`.
- Do **not** claim the profiles are enforced. Use language like “Sero policy intent” and “not applied by current Sero OpenShell Local integration.”
- No `any`, no `@ts-ignore`, top-level imports only.

### Files
- `packages/common/src/openshell-policy.ts` — new shared profile catalog and helper functions.
- `packages/common/src/index.ts` — export the catalog/types.
- `packages/common/src/openshell-policy.test.ts` — focused tests for default/lookup/profile completeness if package test setup supports it; otherwise place the test in the existing nearest common test pattern.

### Expected Outcome
Workers and UI can import one canonical catalog and render accurate profile access summaries without duplicating profile copy.

### Example
Use this shape; keep all values data-only:

```ts
export type OpenShellPolicyProfileId =
  | 'strict'
  | 'dev'
  | 'browser-agent'
  | 'gpu-agent'
  | 'plugin-test';

export interface OpenShellPolicyProfile {
  id: OpenShellPolicyProfileId;
  label: string;
  summary: string;
  filesystemAccess: string[];
  networkAccess: string[];
  processAccess: string[];
  staticBoundaries: string[];
  hotReloadableBoundaries: string[];
  sandboxRecreationRequiredFor: string[];
  unsupportedInCurrentCli: string[];
}

export const DEFAULT_OPENSHELL_POLICY_PROFILE_ID: OpenShellPolicyProfileId = 'dev';

export const OPENSHELL_POLICY_PROFILES: OpenShellPolicyProfile[] = [
  {
    id: 'dev',
    label: 'Dev',
    summary: 'Developer workflow profile for package installs, GitHub, and local dev servers.',
    filesystemAccess: ['Workspace read/write under /sandbox/workspace/<name>'],
    networkAccess: ['Package registries and GitHub intended; exact enforcement not applied by Sero yet'],
    processAccess: ['Normal shell commands inside the sandbox; no interactive OpenShell PTY yet'],
    staticBoundaries: ['Filesystem/Landlock and process boundaries require sandbox creation-time policy'],
    hotReloadableBoundaries: ['Network endpoint policy can be hot-reloaded by OpenShell policy update when Sero supports templates'],
    sandboxRecreationRequiredFor: ['Filesystem access changes', 'Process policy changes', 'GPU resource changes'],
    unsupportedInCurrentCli: ['Sero does not yet compile this profile to OpenShell policy YAML'],
  },
];

export function getOpenShellPolicyProfile(id?: OpenShellPolicyProfileId): OpenShellPolicyProfile {
  return OPENSHELL_POLICY_PROFILES.find((profile) => profile.id === id)
    ?? OPENSHELL_POLICY_PROFILES.find((profile) => profile.id === DEFAULT_OPENSHELL_POLICY_PROFILE_ID)!;
}
```

### Acceptance Criteria
- [ ] All five required profiles exist with filesystem/network/process sections.
- [ ] Static vs hot-reloadable boundaries are represented in data, not hardcoded only in UI.
- [ ] Default lookup returns Dev for missing/unknown profile IDs.
- [ ] `packages/common/src/index.ts` exports the new types/constants/helpers.
- [ ] Tests or a documented local verification prove catalog completeness.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO OPENSHELL-POLICY-PROFILES-02 — Extend workspace runtime config and IPC contracts for selected profiles

**Status:** Closed — Mirrored OpenShell policy profile selection/update/history fields across desktop workspace config, IPC/admin bridge, and app-runtime contracts using canonical `@sero-ai/common` profile types. Verified with `pnpm --filter @sero-ai/common typecheck`, `pnpm typecheck`, and touched-source line counts under 500 LOC.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
Persist the selected OpenShell policy profile and a small audit trail in workspace runtime config. Keep main-process, renderer, common IPC, and app-runtime contracts in sync.

### Constraints
- Add fields to every `WorkspaceRuntimeConfig` mirror that crosses IPC/runtime boundaries.
- Use canonical `OpenShellPolicyProfileId` from `@sero-ai/common`; avoid redefining the ID union in multiple files.
- Add a capped audit shape with timestamp/profile/action text. Keep it JSON-safe.
- Do **not** use `localStorage` or `sessionStorage`.
- Do **not** change host or Apple container behavior.
- Do **not** destroy/recreate sandboxes on profile selection in this todo; this todo is persistence/contracts only.
- No `any`, no `@ts-ignore`, top-level imports only.

### Files
- `apps/desktop/src/types/workspace.ts` — add `policyProfileId`, `policyProfileUpdatedAt`, `policyProfileHistory` to `WorkspaceRuntimeConfig`.
- `packages/common/src/admin-bridge.ts` — mirror fields in `WorkspaceRuntimeConfigIPC` and add diagnostics type slots as needed.
- `packages/common/src/app-runtime-background.ts` — mirror fields in `AppRuntimeWorkspaceRuntimeConfig`.
- `apps/desktop/src/types/ipc.ts` — export new workspace type imports if needed.
- Relevant tests that currently construct `WorkspaceRuntimeConfig` fixtures.

### Expected Outcome
A `.sero-workspace.json` can contain:

```json
{
  "runtime": {
    "providerId": "openshell-local",
    "gatewayName": "sero-local",
    "experimental": true,
    "policyProfileId": "dev",
    "policyProfileUpdatedAt": "2026-05-05T12:00:00.000Z",
    "policyProfileHistory": [
      {
        "profileId": "dev",
        "changedAt": "2026-05-05T12:00:00.000Z",
        "message": "Selected during workspace creation"
      }
    ]
  }
}
```

### Example
Follow the existing type style in `apps/desktop/src/types/workspace.ts` and import the canonical ID:

```ts
import type { OpenShellPolicyProfileId } from '@sero-ai/common';

export interface WorkspaceRuntimePolicyHistoryEntry {
  profileId: OpenShellPolicyProfileId;
  changedAt: string;
  message: string;
}

export interface WorkspaceRuntimeConfig {
  providerId: WorkspaceRuntimeProviderId;
  gatewayName?: string;
  sandboxName?: string;
  runtimeWorkspacePath?: string;
  experimental?: boolean;
  policyProfileId?: OpenShellPolicyProfileId;
  policyProfileUpdatedAt?: string;
  policyProfileHistory?: WorkspaceRuntimePolicyHistoryEntry[];
}
```

### Acceptance Criteria
- [ ] All runtime config mirrors compile with the same policy fields.
- [ ] Existing host/apple-container configs remain valid without policy fields.
- [ ] OpenShell configs can persist a selected profile and audit history.
- [ ] Typecheck catches invalid profile IDs.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO OPENSHELL-POLICY-PROFILES-03 — Add OpenShell policy diagnostics in the main process

**Status:** Closed — Added read-only OpenShell policy diagnostics with sanitized CLI summaries, best-effort blocked log parsing, common IPC types, and focused command-shape/log parser tests. Verified with targeted Vitest, full desktop test run, root typecheck, and touched-source line counts under 500 LOC.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
Implement read-only policy diagnostics for OpenShell Local workspaces. Diagnostics should report selected Sero profile, current enforcement status, active OpenShell policy output where available, policy history output where available, and recent blocked/denied events parsed from logs.

### Constraints
- Create a focused module under `apps/desktop/electron/features/workspace/runtime/openshell/`; keep it below 500 LOC.
- Use existing `runOpenShell()` and `formatOpenShellFailure()` patterns from `openshell/cli.ts`.
- CLI calls must be read-only: `policy get`, `policy list`, and `logs` only.
- Do **not** call `policy set`, `policy update`, or `sandbox create --policy` in Phase 3.
- Treat missing sandbox as non-fatal: return diagnostics explaining that active policy/logs are unavailable until sandbox creation.
- Sanitize/truncate CLI output; do not include secrets or full command payloads.
- Blocked-event parsing must be best-effort and clearly labeled.
- No `any`, no `@ts-ignore`, top-level imports only.

### Files
- `apps/desktop/electron/features/workspace/runtime/openshell/policy-diagnostics.ts` — new diagnostics module.
- `apps/desktop/electron/features/workspace/runtime/openshell/policy-diagnostics.test.ts` or nearest existing Electron test folder — tests for command shapes and log parsing.
- `packages/common/src/admin-bridge.ts` — add `openShellPolicy?: OpenShellPolicyDiagnosticsIPC` to `WorkspaceRuntimeDiagnosticsIPC` if not already done by Todo 02.

### Expected Outcome
Runtime diagnostics for an OpenShell Local workspace can show:

- selected profile (e.g. Dev),
- enforcement status: `profile-preview-only`,
- active policy CLI summary or a clear unavailable message,
- recent matching denied/blocked log events,
- unsupported allow/deny prompt status.

### Example
Expected module shape:

```ts
import {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  getOpenShellPolicyProfile,
  type OpenShellPolicyDiagnosticsIPC,
} from '@sero-ai/common';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import { formatOpenShellFailure, runOpenShell } from './cli';

export async function getOpenShellPolicyDiagnostics(input: {
  gatewayName: string;
  sandboxName: string;
  runtimeConfig?: WorkspaceRuntimeConfig;
}): Promise<OpenShellPolicyDiagnosticsIPC> {
  const profileId = input.runtimeConfig?.policyProfileId ?? DEFAULT_OPENSHELL_POLICY_PROFILE_ID;
  const profile = getOpenShellPolicyProfile(profileId);
  const activePolicy = await runOpenShell([
    '--gateway', input.gatewayName,
    'policy', 'get', input.sandboxName,
    '--full',
  ], { timeoutMs: 10_000 });

  return {
    selectedProfile: profile,
    enforcementStatus: 'profile-preview-only',
    enforcementMessage: 'Sero stores this profile as policy intent but does not apply generated OpenShell policy YAML yet.',
    activePolicy: activePolicy.exitCode === 0
      ? { available: true, summary: activePolicy.stdout.slice(0, 4000) }
      : { available: false, summary: formatOpenShellFailure('read OpenShell policy', activePolicy) },
    blockedEvents: [],
    allowDenyPromptsSupported: false,
  };
}
```

Reference existing command wrapper patterns in `apps/desktop/electron/features/workspace/runtime/openshell/ports.ts` and `logs.ts`.

### Acceptance Criteria
- [ ] Diagnostics use only read-only OpenShell CLI operations.
- [ ] Missing OpenShell/sandbox/policy state returns actionable diagnostics, not thrown UI-breaking errors.
- [ ] Log parser detects obvious strings containing `denied`, `blocked`, `policy`, `landlock`, or `permission denied` without false hard failures.
- [ ] Tests assert exact command shapes include `--gateway <name> policy get <sandbox> --full`, `policy list`, and `logs <sandbox> -n 200 --source all --level warn`.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO OPENSHELL-POLICY-PROFILES-04 — Attach policy diagnostics to runtime diagnostics and capability copy

**Status:** Closed — Wired read-only OpenShell policy diagnostics into existing runtime diagnostics IPC, added profile-aware unsupported-enforcement capability copy, reused OpenShell default gateway/sandbox names without mutations, and verified with desktop tests plus root typecheck.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
Wire OpenShell policy diagnostics into `window.sero.workspace.getRuntimeDiagnostics()` and make OpenShell capability details profile-aware enough to mention selected profile and unsupported enforcement.

### Constraints
- Use the existing runtime diagnostics IPC path; do not create a new IPC channel unless absolutely necessary.
- Keep non-OpenShell runtime diagnostics unchanged.
- Resolve gateway/sandbox names with the same defaults used by `openshell-local-runtime-adapter.ts`.
- Do not start or create an OpenShell sandbox just to gather diagnostics.
- Do not mutate policy or runtime config from diagnostics.
- Keep copy explicit: profile selection is persisted Sero intent; current Sero/OpenShell Local does not apply generated policy YAML.
- No `any`, no `@ts-ignore`, top-level imports only.

### Files
- `apps/desktop/electron/ipc/workspace/workspace.ts` — attach `openShellPolicy` for OpenShell Local diagnostics.
- `apps/desktop/electron/features/workspace/runtime-resolution.ts` — include profile-aware OpenShell capability detail text if helpful.
- `apps/desktop/electron/features/workspace/runtime/adapters/openshell-local-runtime-adapter.ts` — export or share default gateway/sandbox helpers if needed; avoid duplicating default names.
- Tests covering `getRuntimeDiagnostics()` output for OpenShell with selected profile.

### Expected Outcome
Renderer callers receive runtime diagnostics with an `openShellPolicy` object for OpenShell Local workspaces, and no such object for host/apple-container workspaces.

### Example
Expected wiring style in `workspace.ts`:

```ts
async function getRuntimeDiagnostics(
  workspaceId: string,
): Promise<WorkspaceRuntimeDiagnosticsIPC> {
  const runtime = await createWorkspaceRuntimeFacade(workspaceId);
  const runtimeHealth = await getRuntimeHealth(runtime);
  const openShellPolicy = runtime.providerId === 'openshell-local'
    ? await getOpenShellPolicyDiagnostics({
        gatewayName: runtime.resolution.runtimeConfig?.gatewayName ?? DEFAULT_GATEWAY_NAME,
        sandboxName: runtime.resolution.runtimeConfig?.sandboxName
          ?? getDefaultOpenShellSandboxName(workspaceId),
        runtimeConfig: runtime.resolution.runtimeConfig,
      })
    : undefined;

  return {
    ...runtime.resolution,
    providerId: runtime.providerId,
    runtimeHealth,
    openShellPolicy,
  };
}
```

Reference current `getRuntimeDiagnostics()` implementation in `apps/desktop/electron/ipc/workspace/workspace.ts` and `createOpenShellCapabilityAudit()` in `runtime-resolution.ts`.

### Acceptance Criteria
- [ ] `getRuntimeDiagnostics(openShellWorkspaceId)` includes selected profile, enforcement status, boundary copy, and blocked events array.
- [ ] `getRuntimeDiagnostics(hostWorkspaceId)` and apple-container output remain unchanged except for additive optional type fields.
- [ ] Diagnostics do not create a gateway/sandbox or mutate policy.
- [ ] Tests cover selected profile fallback to Dev when config has no `policyProfileId`.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO OPENSHELL-POLICY-PROFILES-05 — Add OpenShell policy profile selection to workspace creation

**Status:** Closed — Added create-time OpenShell profile selector with Dev default, explicit intent-only enforcement copy, persisted profile audit config, and focused renderer/config tests. Verified with desktop Vitest and root typecheck.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
When a user creates a new OpenShell Local workspace, let them choose one of the five Sero policy profiles and persist the selected profile in the runtime config.

### Constraints
- Extend existing `AddWorkspaceViews.tsx` / `AddWorkspaceMenu.tsx`; do not create a large new settings workflow.
- Only show the profile selector when `runtimeChoice === 'openshell-local'`.
- Default profile selection must be `dev`.
- Persist `policyProfileId`, `policyProfileUpdatedAt`, and one audit history entry when creating an OpenShell workspace.
- Do **not** imply profile enforcement. The create UI must include explicit copy that profiles are policy intent and current enforcement is reported in diagnostics.
- No `localStorage`/`sessionStorage`; use existing create workspace flow.
- Avoid `useEffect`; current component can manage form state directly with `useState`.
- No `any`, no `@ts-ignore`, top-level imports only.

### Files
- `apps/desktop/src/components/layout/workspace/AddWorkspaceViews.tsx` — render profile selector beneath OpenShell Local runtime choice.
- `apps/desktop/src/components/layout/workspace/AddWorkspaceMenu.tsx` — maintain selected profile state and include it in `toRuntimeConfig()`.
- `apps/desktop/src/components/layout/workspace/AddWorkspaceViews.test.tsx` — cover selector rendering/default/profile callback.
- Existing workspace tests/fixtures as needed.

### Expected Outcome
Creating an OpenShell Local workspace stores a profile-aware runtime config and shows users what each profile intends to grant before creation.

### Example
Follow existing compact radio-button style in `AddWorkspaceViews.tsx`; import profile data from common:

```tsx
import {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  OPENSHELL_POLICY_PROFILES,
  type OpenShellPolicyProfileId,
} from '@sero-ai/common';

{runtimeChoice === 'openshell-local' && (
  <div className="rounded-md border border-[var(--border-default)] p-2">
    <p className="mb-2 text-xs text-[var(--text-muted)]">
      Profiles describe Sero policy intent. Current OpenShell Local diagnostics report whether OpenShell has an active policy; Sero does not apply generated policy YAML yet.
    </p>
    {OPENSHELL_POLICY_PROFILES.map((profile) => (
      <button
        key={profile.id}
        type="button"
        role="radio"
        aria-checked={policyProfileId === profile.id}
        onClick={() => onPolicyProfileChange(profile.id)}
      >
        <span>{profile.label}</span>
        <span>{profile.summary}</span>
      </button>
    ))}
  </div>
)}
```

And in `AddWorkspaceMenu.tsx`:

```ts
function toRuntimeConfig(
  choice: RuntimeChoice,
  policyProfileId: OpenShellPolicyProfileId = DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
): WorkspaceRuntimeConfig | undefined {
  if (choice === 'openshell-local') {
    const changedAt = new Date().toISOString();
    return {
      providerId: choice,
      gatewayName: 'sero-local',
      experimental: true,
      policyProfileId,
      policyProfileUpdatedAt: changedAt,
      policyProfileHistory: [{ profileId: policyProfileId, changedAt, message: 'Selected during workspace creation' }],
    };
  }
  // existing host/apple/default behavior unchanged
}
```

### Acceptance Criteria
- [ ] Profile selector appears only when OpenShell Local is selected.
- [ ] Dev is selected by default.
- [ ] Create flow persists selected profile and audit entry in runtime config.
- [ ] UI copy explicitly says enforcement is not applied by Sero yet.
- [ ] Existing runtime selector tests still pass after updates.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO OPENSHELL-POLICY-PROFILES-06 — Add an existing-workspace OpenShell policy popover

**Status:** Closed — Added the OpenShell-only workspace row policy popover with profile selection/history persistence, diagnostics refresh, boundary/recreation/unsupported copy, and focused renderer tests.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
Add a compact policy UX for existing OpenShell Local workspaces. It should let users view/change the selected profile, inspect filesystem/network/process grants, understand static vs hot-reloadable boundaries, see sandbox recreation guidance, and see recent blocked events from diagnostics.

### Constraints
- Keep this scoped to workspace-row UI; do not build a full settings page.
- Only render the policy action/popover for `workspace.runtime?.providerId === 'openshell-local'`.
- Use `window.sero.workspace.getRuntimeDiagnostics(workspace.id)` to fetch policy diagnostics when the popover opens or on refresh.
- Use `useWorkspaceStore.setRuntime()` or a small store helper that wraps it; do not bypass IPC persistence.
- Cap policy profile history to 20 entries when changing profiles.
- Do **not** use `localStorage` or `sessionStorage`.
- Do **not** say profile changes are applied to a running sandbox. Copy must explain static changes require sandbox recreation once enforcement exists, and current Sero/OpenShell Local does not apply profile YAML.
- Avoid broad `useEffect`; event-triggered loading on popover open is acceptable if needed as an external IPC side effect.
- No `any`, no `@ts-ignore`, top-level imports only.

### Files
- `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx` — add Shield/Lock policy action for OpenShell workspaces.
- `apps/desktop/src/components/layout/workspace/OpenShellPolicyMenu.tsx` — new focused popover component.
- `apps/desktop/src/stores/workspace.ts` — optional helper `setOpenShellPolicyProfile(id, profileId)` to merge runtime config and append audit history.
- Tests for the new menu and workspace node visibility.

### Expected Outcome
Users can inspect and change Sero's selected OpenShell profile on an existing workspace, while seeing clear unsupported/enforcement and sandbox recreation messaging.

### Example
Reference the existing popover/action style in `WorkspaceReferencesMenu.tsx` and `WorkspaceNode.tsx`. The new menu should look like this structurally:

```tsx
import { Shield } from 'lucide-react';
import {
  OPENSHELL_POLICY_PROFILES,
  getOpenShellPolicyProfile,
  type OpenShellPolicyProfileId,
} from '@sero-ai/common';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import type { WorkspaceInfo } from '@/types/ipc';

export function OpenShellPolicyMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const selected = getOpenShellPolicyProfile(workspace.runtime?.policyProfileId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span title={`OpenShell policy: ${selected.label}`}>
          <Shield className="size-3" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <p className="text-xs text-[var(--text-muted)]">
          Profiles are Sero policy intent. Current OpenShell Local diagnostics report active policy; Sero does not apply generated policy YAML yet.
        </p>
        {OPENSHELL_POLICY_PROFILES.map((profile) => (
          <button key={profile.id} type="button" onClick={() => void selectProfile(profile.id)}>
            {profile.label}
          </button>
        ))}
        <section>
          <h4>Filesystem</h4>
          {selected.filesystemAccess.map((line) => <p key={line}>{line}</p>)}
        </section>
      </PopoverContent>
    </Popover>
  );
}
```

### Acceptance Criteria
- [ ] OpenShell workspaces show a policy action; host/apple-container workspaces do not.
- [ ] Menu displays all five profiles and selected profile state.
- [ ] Menu displays filesystem, network, process, static boundary, hot-reloadable boundary, and sandbox recreation sections.
- [ ] Changing profile persists runtime config and appends a capped audit history entry.
- [ ] Diagnostics blocked events are shown when present; no-events and unavailable states are clear.
- [ ] Copy says allow/deny prompts are unsupported in current OpenShell Local.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO OPENSHELL-POLICY-PROFILES-07 — Update docs and final validation for Phase 3 limitations

**Status:** Closed — Updated Phase 3 docs to describe policy profile intent + diagnostics UX, preview-only enforcement, unsupported allow/deny prompts, best-effort log-derived denied events, static/hot-reload boundaries, and sandbox recreation requirements. Verified with `pnpm typecheck` and line counts.  
**Tags:** `openshell-policy-profiles`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-05-openshell-policy-profiles/plan.md`

### What
Update the Phase 3 documentation to reflect what shipped, including explicit limitations around policy enforcement, allow/deny prompts, and sandbox recreation. Run validation and ensure no file-size rule is violated.

### Constraints
- Update `docs/features/openshell-runtime-proposal-v2.md` only after implementation behavior is known.
- Do **not** mark Phase 3 complete unless acceptance criteria are actually satisfied by implemented behavior.
- Document that profile enforcement is preview/intent-only if no policy YAML application exists.
- Document that denied/blocked events are best-effort from recent OpenShell logs.
- Document static vs hot-reloadable boundaries in user-facing language.
- Run `pnpm typecheck` from the repo root before completion.
- Check line counts for every touched source file; refactor anything over 500 LOC.

### Files
- `docs/features/openshell-runtime-proposal-v2.md` — update Phase 3 current status/limitations/acceptance notes.
- Any implementation tests touched by previous todos.

### Expected Outcome
The docs match the implemented Phase 3 behavior and do not overclaim security enforcement.

### Example
Use wording like this in the Phase 3 status section:

```md
Current status: Implemented as policy profile intent + diagnostics UX.

Sero now stores a selected OpenShell policy profile per workspace and displays
filesystem/network/process intent, static vs hot-reloadable boundaries, active
OpenShell policy diagnostics where available, and recent denied/blocked log
matches. Sero does not yet compile profiles to OpenShell policy YAML or apply
`policy set/update`; unsupported enforcement and allow/deny prompt flows are
shown explicitly in the UI.
```

Reference `docs/features/openshell-runtime-proposal-v2.md` Phase 2.5 wording for the style of explicit limitations and non-goals.

### Acceptance Criteria
- [ ] Phase 3 docs describe implemented behavior and accepted limitations.
- [ ] Docs explicitly state whether profile enforcement is applied or preview-only.
- [ ] Docs mention static filesystem/process changes require sandbox recreation once enforcement is supported, while network policy is hot-reloadable by OpenShell.
- [ ] `pnpm typecheck` passes from repo root.
- [ ] Relevant tests pass or are documented with exact commands.
- [ ] `wc -l` confirms no touched source file exceeds 500 LOC.
