# Onboarding Simplification & Resilience Specification

## Overview

- **Problem**: Sero onboarding is currently too form-like, too eager to expose model/tier complexity, and too fragile around cloned or expired provider auth. Users can reach a broken state after apparently valid onboarding steps, while healthy setups still require too many explicit decisions.
- **Solution**: Replace the current auth-first / tier-first onboarding flow with a preflight-driven, recommendation-first onboarding system. Sero should compute the best available setup up front, show a one-click confirmation in the common case, preserve valid existing choices, surface broken providers clearly, and allow advanced customization without making it mandatory.
- **Success Criteria**:
  - onboarding defaults to a **one-click confirm** path in healthy/common cases
  - valid saved/imported profile choices are preserved where possible
  - broken imported providers are surfaced as warnings, not silent failures
  - onboarding is blocked only until at least one usable model path exists
  - tier customization remains available, but becomes an advanced path
  - provider defaults are configurable via app state and editable through the Admin plugin or `sero cli`
- **Key Stakeholders**:
  - first-time Sero users
  - existing users creating new profiles
  - users cloning profiles with stale auth
  - maintainers of onboarding/auth/model settings flows
  - Admin plugin maintainers

---

## Interview-Derived Product Decisions

These decisions are treated as authoritative for this spec:

1. **Common-case UX target**: one-click confirm, with override available.
2. **Recommendation policy**: preserve valid existing choices first.
3. **Broken imported providers**: continue with warning if at least one healthy provider remains.
4. **Validation strategy**: fast best-effort, not strict blocking verification.
5. **Onboarding customization scope**: tier selections only.
6. **Provider default configurability**: editable in-app via Admin plugin, persisted in app state; `sero cli` may also edit them.
7. **Fresh profile behavior**: after first working auth, return to the same recommended confirmation step.
8. **Cross-provider recommendation**:
   - prefer the user’s existing/default provider first
   - otherwise prefer a cohesive single-provider recommendation
9. **Broken provider visibility**: compact inline warning on the confirm screen.
10. **Onboarding gate**: do not allow bypass into the app until at least one usable model path exists.
11. **Global vs profile state**:
   - provider defaults: app-level/shared source of truth, with optional per-profile overrides
   - tier selections: per-profile
12. **Cloned credential validation timing**: first-launch onboarding preflight.
13. **Rollout**: single cohesive feature rollout, not phased behind a feature flag.

---

## Detailed Requirements

### Functional Requirements

1. Sero must run an **onboarding preflight** before rendering onboarding UI.
2. The preflight must compute whether the active profile has at least one usable model path.
3. The preflight must classify provider/model sources into actionable states, including:
   - healthy
   - broken/expired
   - env-backed
   - local
   - missing
   - unknown
4. The preflight must validate existing per-profile tier selections against current usable models.
5. If an existing tier selection is still valid, it must be preserved.
6. If an existing tier selection is invalid, Sero must repair or replace it with a recommendation.
7. Sero must compute recommended LOW/MED/HIGH tiers from:
   1. valid existing profile selections
   2. valid imported selections
   3. provider defaults
   4. capability-ranked healthy model fallback
8. In the common case where a usable setup exists, onboarding must show a **ready/confirm** screen rather than sending users directly to a blank tier editor.
9. The ready screen must show:
   - recommended LOW/MED/HIGH models
   - a short provider health summary
   - Continue action
   - Customize models action
   - Add/reconnect provider action
10. The ready screen must show broken providers as a compact inline warning when healthy usable models still exist.
11. The advanced customization path must allow editing LOW/MED/HIGH tier selections only.
12. The advanced customization path must prefill the currently recommended or preserved tier selections.
13. The onboarding tier editor must hide or disable broken providers rather than treating them as normal healthy choices.
14. For a brand-new profile with no auth and no env/local models, onboarding must require the user to connect at least one provider before continuing.
15. After the first successful auth in a fresh profile, onboarding must return to the same recommended confirm screen rather than launching directly into the memory session.
16. For cloned profiles, copied `auth.json` and `modelTiers` may still be imported, but their real validity must be checked during preflight.
17. If cloned providers are broken but healthy alternatives exist, onboarding must continue with warning and allow targeted reconnect actions.
18. If no usable models exist after preflight, onboarding must move to an auth/reconnect state.
19. Once a valid setup is confirmed, onboarding must save tier selections to the current profile before launching the welcome session.
20. Provider default recommendations must be stored in app state and be editable outside onboarding via Admin plugin or `sero cli`.
21. Provider defaults must support optional per-profile override capability, but the default source of truth must be global/shared.
22. If the recommended provider fails between preflight and welcome-session launch, Sero should auto-switch to the next healthy recommendation if one exists and inform the user inline; if no suitable fallback exists, return to actionable onboarding UI.
23. Onboarding must remain a gate until there is at least one usable model path.

### Non-Functional Requirements

1. Preflight must feel fast and not hold the UI hostage on slow/uncertain providers.
2. Broken provider detection must be best-effort, not excessively blocking.
3. The common path should minimize clicks and cognitive load.
4. Renderer components touched by this work must stay under the 500 LOC project rule.
5. IPC additions must follow the four-layer data-flow convention:
   - React component
   - Zustand / renderer state
   - preload bridge
   - Electron IPC handler / feature module
6. Avoid unnecessary `useEffect`; prefer centralized state/actions for onboarding state orchestration where possible.
7. Recommendations must be deterministic given the same inputs.
8. Auth/provider failures must be surfaced with user-friendly provider-specific messaging.
9. Existing settings/profile data must remain backward compatible.

---

## Technical Design

### Architecture

Introduce a dedicated onboarding feature layer in Electron that becomes the single source of truth for onboarding decisions.

#### High-level flow

1. Renderer mounts onboarding shell.
2. Renderer requests `window.sero.onboarding.getState()`.
3. Electron onboarding service performs preflight:
   - reads active profile tiers
   - reads global provider defaults
   - inspects providers/model sources
   - performs fast health assessment
   - computes validated recommendations
4. Renderer renders one of the exact onboarding states.
5. User either:
   - confirms setup
   - customizes tiers
   - reconnects/adds provider
6. Renderer saves onboarding decisions via onboarding IPC.
7. Renderer launches welcome session using saved validated tiers.

#### New internal modules

Suggested new files/folders:

- `apps/desktop/electron/features/onboarding/`
  - `index.ts`
  - `types.ts`
  - `preflight.ts`
  - `provider-health.ts`
  - `recommendations.ts`
  - `state.ts` (optional composition helper)
- `apps/desktop/electron/shared/settings/provider-model-defaults.ts`
- `apps/desktop/electron/ipc/onboarding/`
  - `onboarding.ts`
- `apps/desktop/electron/preload/onboarding.ts`

### Exact Onboarding States

Renderer-visible onboarding state machine:

```ts
type OnboardingPhase =
  | 'checking'
  | 'ready'
  | 'customize'
  | 'auth'
  | 'launching'
  | 'error'
  | 'done';
```

#### State meanings

- `checking`: preflight in progress
- `ready`: valid recommended setup exists; primary one-click screen
- `customize`: advanced tier editor
- `auth`: no usable model path, or user explicitly chose reconnect/add provider
- `launching`: saving selections + opening welcome session
- `error`: unexpected onboarding failure that needs retry/recovery
- `done`: onboarding complete or not needed

### Recommendation Rules

#### Inputs

- active profile’s `modelTiers`
- active profile’s optional provider-default overrides
- global provider defaults
- auth/provider states
- available model groups
- existing provider preference, if inferable

#### Provider preference rules

1. If the user already has a clear valid provider preference, prefer that provider.
2. Otherwise prefer a cohesive single-provider recommendation.
3. Only mix providers if necessary to fill missing tiers or preserve valid explicit user choices.

#### Tier recommendation rules

For each tier, resolve in this order:

1. valid current profile tier
2. valid imported tier
3. valid profile-level provider-default override for preferred provider
4. valid global provider default for preferred provider
5. capability-ranked healthy fallback within preferred provider
6. capability-ranked healthy fallback across all providers

### Provider Default Registry

Add a provider-default settings module.

Suggested types:

```ts
export type ProviderTierDefaults = Partial<Record<'LOW' | 'MED' | 'HIGH', string>>;

export type ProviderModelDefaults = Record<string, ProviderTierDefaults>;

export interface ResolvedProviderDefaultsState {
  globalDefaults: ProviderModelDefaults;
  profileOverrides?: ProviderModelDefaults;
  effectiveDefaults: ProviderModelDefaults;
}
```

#### Storage model

- global/shared defaults in app state
- optional per-profile overrides in profile settings/state
- onboarding tier choices remain per-profile in `settings.json` under `sero.modelTiers`

### Provider Health Model

Suggested provider health types:

```ts
export type ProviderHealthStatus =
  | 'healthy'
  | 'broken_expired'
  | 'broken_invalid'
  | 'env'
  | 'local'
  | 'missing'
  | 'unknown';

export interface ProviderHealthInfo {
  providerId: string;
  displayName: string;
  status: ProviderHealthStatus;
  message?: string;
  canReconnect: boolean;
  hasUsableModels: boolean;
  usableModelIds: string[];
}
```

#### Health-check strategy

- fast best-effort
- do not block entire onboarding on slow providers
- imported or suspicious providers may get a deeper targeted check
- unknown providers should not be treated as confidently healthy defaults unless model availability is otherwise clear

### Onboarding State Shape

Suggested IPC-returned shape:

```ts
export interface OnboardingRecommendation {
  tiers: Partial<Record<'LOW' | 'MED' | 'HIGH', { provider: string; modelId: string }>>;
  source: 'existing' | 'imported' | 'provider-defaults' | 'fallback';
  preferredProvider?: string;
}

export interface OnboardingWarning {
  code:
    | 'broken_imported_providers'
    | 'invalid_existing_tiers'
    | 'no_usable_models'
    | 'provider_recommendation_changed';
  message: string;
  providerIds?: string[];
}

export interface OnboardingState {
  needed: boolean;
  phase: 'ready' | 'auth' | 'error' | 'done';
  hasAnyUsableModels: boolean;
  hasImportedCredentials: boolean;
  recommendation: OnboardingRecommendation | null;
  providerHealth: ProviderHealthInfo[];
  availableModelGroups: AvailableModelGroup[];
  warnings: OnboardingWarning[];
  preservedTiers: ModelTierSettings;
  invalidTiers: Array<'LOW' | 'MED' | 'HIGH'>;
}
```

### IPC Design

#### New renderer API

```ts
interface SeroOnboardingAPI {
  getState(): Promise<OnboardingState>;
  saveTierSelections(tiers: ModelTierSettings): Promise<void>;
  saveProviderDefaults(defaults: ProviderModelDefaults): Promise<void>;
  reconnectProvider(providerId: string): Promise<void>; // may forward into auth flow helper
  dismissWarning?(code: string): Promise<void>; // optional, only if needed
}
```

#### IPC channels

Suggested additions:

```ts
onboarding: {
  getState: 'sero:onboarding:get-state',
  saveTierSelections: 'sero:onboarding:save-tier-selections',
  getProviderDefaults: 'sero:onboarding:get-provider-defaults',
  saveProviderDefaults: 'sero:onboarding:save-provider-defaults',
  reconnectProvider: 'sero:onboarding:reconnect-provider',
}
```

### APIs & Integrations

The onboarding feature will compose existing APIs rather than replacing them:

- `profiles.needsOnboarding()`
- `auth.getProviders()`
- `models.list()`
- `modelTiers.get()` / `modelTiers.set()`
- auth login flow via `auth.login()` / OAuth event stream

But the renderer should stop orchestrating these directly for onboarding logic. That logic should move into the onboarding feature/IPC.

### Scalability Considerations

This is not traffic-scale sensitive, but operational complexity can grow as providers and local model sources expand.

To keep the design maintainable:

- centralize recommendation logic in a single module
- centralize provider health logic in a single module
- separate provider defaults from profile tiers
- avoid UI components each re-implementing model filtering/health logic

### Security Design

- do not surface sensitive tokens or raw auth data to the renderer
- only expose provider health/results metadata
- continue using `auth.json` permission hardening
- provider health results should be descriptive, not secret-bearing

---

## User Experience

### User Personas

#### 1. First-time user
Wants to get to a working AI session quickly, does not want to understand provider/model architecture.

#### 2. Existing user creating a new profile
Expects cloned credentials and preferences to “just work” or fail clearly.

#### 3. Power user
Wants control over tiers and provider defaults, but does not want onboarding to force unnecessary work every time.

### Primary User Flows

#### Flow A — Healthy existing/cloned setup
1. User opens new profile.
2. Preflight runs.
3. Existing tiers are validated and preserved.
4. Ready screen shows recommended/preserved setup.
5. User clicks Continue.
6. Welcome memory session launches.

#### Flow B — Fresh profile, no auth
1. User opens new profile.
2. Preflight finds no usable models.
3. Auth screen appears.
4. User connects one provider.
5. Preflight reruns / onboarding state refreshes.
6. Ready screen appears with recommended defaults.
7. User clicks Continue.
8. Welcome session launches.

#### Flow C — Cloned profile with stale imported auth
1. User opens cloned profile.
2. Preflight finds some imported providers broken.
3. Healthy provider still exists.
4. Ready screen appears with healthy recommendation.
5. Compact inline warning shows broken providers and reconnect CTA.
6. User either continues or reconnects a provider.

#### Flow D — User customizes tiers
1. From ready screen, user clicks Customize models.
2. Tier editor opens with prefilled LOW/MED/HIGH.
3. User changes one or more tiers.
4. User saves.
5. Returns to ready/launch flow or launches directly depending on final UX implementation.

### UI States

#### Ready screen
Must include:
- headline indicating Sero is ready / almost ready
- concise recommendation summary for LOW/MED/HIGH
- compact inline warning for broken providers if applicable
- primary CTA: Continue
- secondary CTA: Customize models
- tertiary CTA: Add/reconnect provider

#### Customize screen
Must include:
- prefilled tier choices
- same-model-for-all toggle retained if useful
- healthy models shown normally
- broken provider models hidden or visibly disabled
- Save / Back controls

#### Auth screen
Must include:
- connect provider actions
- reconnect action for broken providers
- clear messaging when there are no usable models yet

#### Launching screen
Must include:
- simple progress indication
- no complex choices

#### Error screen
Must include:
- readable explanation
- retry action
- path back to auth/customize if relevant

### Edge Cases

1. Existing tiers valid but provider defaults changed globally
   - preserve valid tiers; do not overwrite explicit working profile choices
2. Imported tiers reference unavailable models but same provider has healthy defaults
   - replace invalid tiers with recommended alternatives from that provider first
3. Provider passes preflight but fails at launch
   - auto-switch to next healthy recommendation if possible and inform user inline
4. Env-backed models exist with no saved auth
   - treat as usable path; allow ready screen
5. Local models exist with no remote provider
   - treat as usable path if surfaced by model listing
6. No usable provider but some broken imported creds
   - auth/reconnect screen with targeted repair actions
7. User customizes tiers to a provider that later fails
   - preserve choice if still valid; otherwise explain and repair on next onboarding/preflight

---

## Risks & Mitigations

### Risk Register

| Risk | Category | Impact | Probability | Mitigation | Owner |
|------|----------|--------|-------------|------------|-------|
| Provider health checks are too slow and delay onboarding | Technical | Medium | Medium | Use fast best-effort checks, cache results briefly, do not block on uncertain providers | Electron onboarding feature |
| Recommendation logic becomes scattered across renderer and Electron | Technical | High | Medium | Create a dedicated onboarding service and IPC surface as the source of truth | Desktop maintainers |
| Broken providers still leak into recommended tiers | Technical | High | Medium | Centralize provider health filtering before recommendation generation | Electron onboarding feature |
| Users feel forced into hidden automation and don’t trust defaults | UX | Medium | Medium | Always show recommended setup summary before launch; offer Customize models | Product / renderer |
| Admin/defaults editing scope balloons | Timeline | Medium | Medium | Keep onboarding customization tier-only; provider-default editing lives in Admin plugin/CLI | Product / admin plugin |
| Cloned auth problems are still discovered during prompt execution | Technical | High | Medium | Run onboarding preflight on first launch and validate imported providers there | Electron onboarding feature |
| Inconsistent behavior between onboarding and main model selector | Operational | Medium | High | Call out general resilience follow-up explicitly as later phase | Desktop maintainers |

### Accepted Tradeoffs

- Preflight health validation is best-effort, not a strict authoritative full provider audit.
- Onboarding will optimize for the common-case path rather than exposing all model controls immediately.
- Provider defaults editing is in app state and edited via Admin plugin/CLI, not the onboarding UI itself.

### Contingency Plans

- If provider health probing proves too flaky, downgrade some checks to `unknown` and only exclude providers from recommendations when failure is more certain.
- If cross-provider recommendation logic becomes too complex for MVP, constrain the recommendation engine to a preferred-provider-first cohesive strategy and defer mixed-provider optimization.

---

## Implementation Notes

### Key Decisions

1. **Recommendation-first onboarding** replaces empty-form onboarding.
2. **Tier editor becomes advanced customization**, not the default path.
3. **Provider defaults are global/shared app state**, with optional per-profile overrides.
4. **Per-profile tiers remain in profile settings**.
5. **Validation happens in onboarding preflight**, not primarily at clone time.
6. **Single cohesive rollout** is preferred over a feature flag rollout.

### Dependencies

- existing auth IPC and OAuth flow
- existing model listing IPC
- existing model tier persistence
- Admin plugin extension point/settings editor
- optional CLI command surface for provider default editing

### Migration Plan

1. Add provider-default state model with built-in defaults.
2. Add onboarding preflight feature and IPC.
3. Refactor onboarding renderer to consume onboarding state instead of composing auth/models/tier calls directly.
4. Convert tier picker into advanced editor with prefilled selections.
5. Add Admin plugin editing surface for provider defaults.
6. Preserve existing `modelTiers` and auth clone behavior while validating them in preflight.

---

## File-by-File Task Breakdown

### New / Major New Modules

#### `apps/desktop/electron/features/onboarding/types.ts`
Create canonical Electron-side onboarding types:
- `OnboardingState`
- `OnboardingRecommendation`
- `ProviderHealthInfo`
- warning codes
- provider-default state types or import shared types from `src/types/ipc`

#### `apps/desktop/electron/features/onboarding/provider-health.ts`
Implement fast best-effort provider assessment.
Responsibilities:
- infer provider health from auth state + available models
- optionally perform lightweight probe logic
- classify providers into actionable states
- normalize provider-specific messages

#### `apps/desktop/electron/features/onboarding/recommendations.ts`
Implement recommendation engine.
Responsibilities:
- preserve valid tiers
- determine preferred provider
- apply provider defaults
- repair invalid tiers
- produce deterministic recommendation metadata

#### `apps/desktop/electron/features/onboarding/preflight.ts`
Compose:
- `profiles.needsOnboarding`
- provider health
- available model groups
- current tiers
- provider defaults
- warnings
- final `OnboardingState`

#### `apps/desktop/electron/ipc/onboarding/onboarding.ts`
Register onboarding IPC handlers.

#### `apps/desktop/electron/preload/onboarding.ts`
Expose `window.sero.onboarding.*`.

#### `apps/desktop/electron/shared/settings/provider-model-defaults.ts`
Add built-in provider defaults + settings merge/override helpers.

### Existing Files to Update

#### `apps/desktop/src/components/profiles/OnboardingWizard.tsx`
Refactor from local orchestration to onboarding-state-driven rendering.
Expected changes:
- replace current `checking/auth/tiers/...` orchestration with `ready/customize/auth/...`
- call `window.sero.onboarding.getState()`
- render ready screen first when usable setup exists
- move TierPicker behind Customize action
- handle reconnect/add-provider flow
- retain launching/error behavior

#### `apps/desktop/src/components/profiles/TierPicker.tsx`
Convert into advanced customization editor.
Expected changes:
- accept prefilled selections
- optionally accept provider health/filter metadata
- hide/disable broken providers
- save only tier selections
- remove assumption that onboarding starts empty

#### `apps/desktop/src/components/layout/AuthLoginDialog.tsx`
Possible updates:
- support reconnecting a specific provider from onboarding
- allow onboarding refresh callback after successful auth

#### `apps/desktop/src/components/layout/AuthLoginViews.tsx`
Possible updates:
- surface provider state labels/messages more explicitly if auth screen is enriched for onboarding

#### `apps/desktop/electron/ipc/platform/auth/auth.ts`
Potential updates:
- expose richer provider metadata if onboarding service needs it
- or keep this file stable and let onboarding feature compose auth + model info internally

#### `apps/desktop/electron/ipc/workspace/profiles.ts`
Keep clone behavior, but ensure onboarding preflight has enough metadata to know auth/model prefs were imported if needed.
Optional enhancement:
- return whether credentials/model prefs were cloned during profile creation

#### `apps/desktop/electron/ipc/agent/handlers/models.ts`
Potential updates:
- may need richer model-source metadata if onboarding needs to distinguish local/env/remote more explicitly

#### `apps/desktop/src/types/ipc.ts`
Add onboarding types.

#### `apps/desktop/src/types/electron.d.ts`
Add `window.sero.onboarding` API typing.

#### `apps/desktop/src/types/ipc-channels.ts`
Add onboarding channel constants.

#### `apps/desktop/electron/preload/api.ts`
Wire the onboarding preload bridge into `window.sero`.

### Admin Plugin / CLI Work

#### `plugins/sero-admin-plugin/...`
Add provider-default editing UI.
Scope:
- read global provider defaults
- edit LOW/MED/HIGH defaults per provider
- optionally support per-profile overrides later or in a second sub-step

#### CLI (`sero cli`) integration
Add provider-default read/write commands if not already supported by the settings surface.

---

## Operationalization

### Testing Strategy

#### Unit tests
- provider-default resolution
- preferred-provider inference
- tier repair logic
- warning generation
- provider health classification

#### Integration tests
- onboarding preflight with:
  - no auth
  - env-backed auth
  - cloned valid tiers
  - cloned stale providers
  - mixed healthy/broken providers

#### UI tests / renderer tests
- ready screen rendering
- customize path with prefilled tiers
- broken-provider warning rendering
- auth → ready transition
- ready → launching transition

### Deployment Plan

Single cohesive rollout.

Recommended implementation order inside the branch:
1. types + onboarding feature backend
2. preload + IPC bridge
3. renderer onboarding refactor
4. Admin plugin defaults editing
5. tests + polish

### Monitoring & Observability

At minimum, log or track:
- onboarding preflight outcome
- provider health summary counts
- whether recommendation source was existing/imported/default/fallback
- number of broken imported providers encountered
- whether welcome session launched successfully after onboarding

This can initially be debug logging if full analytics are not in scope.

---

## Open Questions

1. What is the exact persisted location/schema for global provider defaults in app state?
2. Do per-profile provider-default overrides need to ship in the first iteration, or just be supported by the model?
3. Should provider-health probing have a small cache window to avoid repeated checks during the same onboarding session?
4. How should onboarding identify a user’s “existing/default provider” when there are multiple historical providers?
5. Should the ready screen allow launching directly after saving custom tiers, or return to the confirmation summary first?

---

## Out of Scope

1. Full redesign of the main app’s model selector outside onboarding.
2. Full provider-health UX parity across all non-onboarding model flows.
3. Rich onboarding editing of provider defaults.
4. Clone-time blocking validation modal during profile creation.
5. Feature-flagged dual onboarding systems.

---

## Phasing

### Phase 1: MVP

Deliver:
- provider-default registry
- onboarding preflight
- ready screen with one-click confirm
- advanced tier customization with prefilled choices
- compact broken-provider warning
- onboarding gate until usable model exists
- preserved valid existing choices

**MVP success criteria**:
- healthy setup reaches ready screen immediately
- fresh profile flows through auth → ready → continue
- broken imported providers no longer fail silently

### Phase 2: Follow-up Enhancements

- stronger provider probing heuristics/caching
- per-profile provider-default override UX
- broader app-wide model/auth resilience alignment
- richer Admin plugin editing and CLI parity
