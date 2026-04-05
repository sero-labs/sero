# Onboarding Polish: Session Lifecycle, Low Thinking, UI Cleanup

**Date:** 2026-04-05
**Branch:** `feat/dynamic-model-selection`

## Problem

The current onboarding flow creates a single session that doubles as both the memory-setup runner and the user's first visible session. This means:

1. The memory setup prompt uses the model's default thinking level, wasting tokens on reasoning that onboarding doesn't need.
2. The user's first session contains the memory-setup conversation rather than a clean welcome.
3. The setup screen UI has inconsistent spacing and select sizing compared to other dialogs.
4. Several helpers are duplicated across files (from PR #121 review).

## Design

### 1. Dedicated Onboarding Session with Low Thinking

**New lifecycle in `OnboardingWizard.launchWelcomeSession`:**

```
User clicks Continue
  |
  v
Create temp session (unnamed)
  |
  v
Open session -> apply chosen model -> set thinking to 'low'
  |
  v
Prompt: memory setup message
  |
  v
On success: close + delete temp session
  |
  v
Create fresh session named "Welcome"
  |
  v
Open -> apply HIGH tier model (normal thinking)
  |
  v
Prompt: "The user just finished onboarding. Say hello,
         introduce yourself briefly, and let them know
         you're ready."
  |
  v
Mark onboarding done, switch to Dashboard
```

**Key details:**

- Temp session uses `window.sero.agent.setThinkingLevel(sessionId, 'low')` after opening.
- Temp session cleanup: `window.sero.agent.close(sessionId)` then `window.sero.sessions.delete(sessionPath)`.
- Fresh session uses the user's HIGH tier model (falling back to MED, then LOW) at the model's default thinking level.
- The welcome prompt is short and instructs the agent to greet the user and confirm readiness.
- Error handling: same auth-error detection and fallback-provider retry as today. If the temp session fails, recovery happens before creating the welcome session. If the welcome session prompt fails, the user still lands in a working session — just without the greeting.

**Files changed:**

- `src/components/profiles/OnboardingWizard.tsx` — rewrite `launchWelcomeSession` to two-session flow.

### 2. UI Polish (SetupScreen)

All changes in `src/components/profiles/onboarding/SetupScreen.tsx`:

- Outer container: `space-y-4` -> `space-y-5` for more breathing room.
- All `SelectTrigger` components: ensure consistent `h-10` height.
- Tier toggle card: increase padding to `px-4 py-3`.
- Tier model fields inside the toggle: increase top margin/padding for separation.
- Consistent label sizing across simple and tiered modes.

No layout restructuring — spacing and consistency only.

### 3. Code Deduplication

**3a. `modelKey` / `parseModelKey` -> `src/lib/model-keys.ts`**

Extract the `modelKey(provider, modelId)` and `parseModelKey(value)` helpers into a shared renderer module. Remove duplicates from:
- `src/components/profiles/onboarding/SetupScreen.tsx`
- `src/components/profiles/TierPicker.tsx`

**3b. `getSeroSettings` -> `electron/shared/settings/settings-helpers.ts`**

Extract the `getSeroSettings(settingsPath)` helper. Remove duplicates from:
- `electron/shared/settings/model-tiers.ts`
- `electron/shared/settings/provider-model-defaults.ts`
- `electron/shared/settings/model-fallback-chain.ts`

**3c. `readSettings` -> same `settings-helpers.ts`**

Extract the `readSettings(settingsPath)` helper. Remove duplicates from:
- `electron/features/onboarding/preflight.ts`
- `electron/ipc/onboarding/onboarding.ts`

**3d. Stale closure fix in `OnboardingWizard.tsx`**

Line ~197: change `getDisplayProviderName(onboardingState, failedProvider)` to use `refreshedState` instead — the pre-refresh `onboardingState` may have stale `providerHealth` data.

### Out of Scope

- **`scoreModelForTier` divergence** (renderer vs main): Both produce reasonable suggestions. Unifying requires a shared module or IPC round-trip. Low risk — follow-up.
- **Admin plugin type duplication**: Touches plugin build pipeline. Independent work — follow-up.
- **TierPicker.tsx consumer audit**: May be unused after SetupScreen rework. Separate cleanup.
