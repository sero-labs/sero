# Onboarding Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish onboarding UX — dedicated low-thinking session for memory setup, clean welcome session after, UI spacing fixes, and code deduplication.

**Architecture:** OnboardingWizard gets a two-session lifecycle (temp onboarding session with low thinking → delete → fresh welcome session). SetupScreen gets spacing/consistency fixes. Duplicated helpers are extracted to shared modules.

**Tech Stack:** React 19, Electron IPC, Zustand, Tailwind 4

---

### Task 1: Extract shared `modelKey` / `parseModelKey` helpers

**Files:**
- Create: `apps/desktop/src/lib/model-keys.ts`
- Modify: `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx:25-36`
- Modify: `apps/desktop/src/components/profiles/TierPicker.tsx:39-49`

- [ ] **Step 1: Create the shared module**

Create `apps/desktop/src/lib/model-keys.ts`:

```typescript
export function modelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function parseModelKey(value: string): { provider: string; modelId: string } | null {
  const separatorIndex = value.indexOf('/');
  if (separatorIndex <= 0) return null;
  return {
    provider: value.slice(0, separatorIndex),
    modelId: value.slice(separatorIndex + 1),
  };
}
```

- [ ] **Step 2: Update SetupScreen.tsx**

Remove the local `modelKey` and `parseModelKey` functions (lines 25-36). Add import at top:

```typescript
import { modelKey, parseModelKey } from '@/lib/model-keys';
```

- [ ] **Step 3: Update TierPicker.tsx**

Remove the local `mkKey` and `parseModelKey` functions (lines 39-49). Replace all `mkKey(` calls with `modelKey(`. Add import at top:

```typescript
import { modelKey, parseModelKey } from '@/lib/model-keys';
```

The `ModelTierEntry` type import stays since `parseModelKey` returns `{ provider: string; modelId: string }` which is structurally compatible.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/model-keys.ts apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx apps/desktop/src/components/profiles/TierPicker.tsx
git commit -m "refactor: extract shared modelKey/parseModelKey to src/lib/model-keys"
```

---

### Task 2: Extract shared `getSeroSettings` and `readSettings` helpers

**Files:**
- Create: `apps/desktop/electron/shared/settings/settings-helpers.ts`
- Modify: `apps/desktop/electron/shared/settings/model-tiers.ts:12-18`
- Modify: `apps/desktop/electron/shared/settings/provider-model-defaults.ts:67-73`
- Modify: `apps/desktop/electron/shared/settings/model-fallback-chain.ts:35-41`
- Modify: `apps/desktop/electron/features/onboarding/preflight.ts:12-19`
- Modify: `apps/desktop/electron/ipc/onboarding/onboarding.ts:18-25`

- [ ] **Step 1: Create the shared module**

Create `apps/desktop/electron/shared/settings/settings-helpers.ts`:

```typescript
import { readFileSync } from 'fs';
import path from 'path';
import { SERO_AGENT_DIR } from '../../platform/env';

/** Extract the `sero` namespace from a parsed settings object. */
export function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Read and parse settings.json from the active agent directory. */
export function readSettings(): Record<string, unknown> {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}
```

- [ ] **Step 2: Update model-tiers.ts**

Remove the local `getSeroSettings` function (lines 12-18). Add import:

```typescript
import { getSeroSettings } from './settings-helpers';
```

- [ ] **Step 3: Update provider-model-defaults.ts**

Remove the local `getSeroSettings` function (lines 67-73). Add import:

```typescript
import { getSeroSettings } from './settings-helpers';
```

- [ ] **Step 4: Update model-fallback-chain.ts**

Remove the local `getSeroSettings` function (lines 35-41). Add import:

```typescript
import { getSeroSettings } from './settings-helpers';
```

Note: `model-fallback-chain.ts` returns `{ ...(raw as Record<string, unknown>) }` (spread copy). The shared version returns the reference directly — callers in `model-fallback-chain.ts` immediately destructure into new objects via `sero.modelFallbackChain`, so the shallow copy is unnecessary. No behavior change.

- [ ] **Step 5: Update preflight.ts**

Remove the local `readSettings` function (lines 12-19). Add import:

```typescript
import { readSettings } from '../../shared/settings/settings-helpers';
```

- [ ] **Step 6: Update onboarding.ts IPC handler**

Remove the local `readSettings` function (lines 18-25). Add import:

```typescript
import { readSettings } from '../../shared/settings/settings-helpers';
```

- [ ] **Step 7: Typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron/shared/settings/settings-helpers.ts apps/desktop/electron/shared/settings/model-tiers.ts apps/desktop/electron/shared/settings/provider-model-defaults.ts apps/desktop/electron/shared/settings/model-fallback-chain.ts apps/desktop/electron/features/onboarding/preflight.ts apps/desktop/electron/ipc/onboarding/onboarding.ts
git commit -m "refactor: extract shared getSeroSettings and readSettings helpers"
```

---

### Task 3: Fix stale closure in OnboardingWizard

**Files:**
- Modify: `apps/desktop/src/components/profiles/OnboardingWizard.tsx:197`

- [ ] **Step 1: Fix the stale closure**

In `OnboardingWizard.tsx`, inside `launchWelcomeSession`, the auth-error recovery block (around line 197):

Change:
```typescript
const failedName = getDisplayProviderName(onboardingState, failedProvider);
```

To:
```typescript
const failedName = getDisplayProviderName(refreshedState, failedProvider);
```

`refreshedState` has already been fetched at this point and has current `providerHealth` data. `onboardingState` is from the closure and may be stale.

- [ ] **Step 2: Typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/profiles/OnboardingWizard.tsx
git commit -m "fix: use refreshedState for failed provider name in onboarding recovery"
```

---

### Task 4: UI polish on SetupScreen

**Files:**
- Modify: `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`

- [ ] **Step 1: Increase outer spacing**

Change the root container class on line 310:

From:
```tsx
<div className="space-y-4">
```

To:
```tsx
<div className="space-y-5">
```

- [ ] **Step 2: Add breathing room to header section**

Change the header section (line 311):

From:
```tsx
<div className="space-y-2">
```

To:
```tsx
<div className="space-y-3">
```

- [ ] **Step 3: Increase icon size for visual weight**

Change the icon container (line 312-314):

From:
```tsx
<div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
  <Sparkles className="size-5 text-[var(--status-success)]" />
</div>
```

To:
```tsx
<div className="flex size-11 items-center justify-center rounded-xl bg-[var(--bg-elevated)]">
  <Sparkles className="size-5 text-[var(--status-success)]" />
</div>
```

- [ ] **Step 4: Increase spacing in the provider/model selector grid**

Change the selects grid (line 329):

From:
```tsx
<div className="grid gap-3">
```

To:
```tsx
<div className="grid gap-4">
```

- [ ] **Step 5: Polish the tier toggle card**

Change the tier toggle card container (line 378):

From:
```tsx
<div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/40 px-3 py-2.5">
```

To:
```tsx
<div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/40 px-4 py-3">
```

Also increase the inner tier fields separator spacing. Change (line 390):

From:
```tsx
<div className="mt-3 border-t border-[var(--border-default)] pt-3">
```

To:
```tsx
<div className="mt-3.5 border-t border-[var(--border-default)] pt-3.5">
```

- [ ] **Step 6: Increase gap in TierModelFields**

In the `TierModelFields` component, change (line 214):

From:
```tsx
<div className="grid gap-3">
```

To:
```tsx
<div className="grid gap-4">
```

- [ ] **Step 7: Polish the footer buttons**

Change the footer (line 410):

From:
```tsx
<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
```

To:
```tsx
<div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
```

- [ ] **Step 8: Typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx
git commit -m "fix(onboarding): improve setup screen spacing and visual consistency"
```

---

### Task 5: Dedicated onboarding session with low thinking

**Files:**
- Modify: `apps/desktop/src/components/profiles/OnboardingWizard.tsx`

This is the core change. The current `launchWelcomeSession` creates one session and uses it for both memory setup and the user's first session. We split it into two: a temp session (low thinking) for memory setup, then a clean welcome session.

- [ ] **Step 1: Add the welcome prompt constant**

At the top of `OnboardingWizard.tsx`, after the existing `WELCOME_PROMPT` constant, add:

```typescript
const WELCOME_GREETING_PROMPT = "The user just finished setting up their profile. Say hello, introduce yourself briefly, and let them know you're ready to help.";
```

- [ ] **Step 2: Extract a helper to create, configure, and run a session**

Add this helper function before the `OnboardingWizard` component (after the existing `applyTierModel` function):

```typescript
async function createAndRunSession(options: {
  name?: string;
  tiers: ModelTierSettings;
  thinkingLevel?: string;
  prompt: string;
  setupUi?: (sessionId: string) => void;
}): Promise<{ sessionId: string; sessionPath: string }> {
  const session = await useSessionStore.getState().createSession('global');
  await window.sero.agent.open(session.id, session.path, 'global');

  if (options.name) {
    await useSessionStore.getState().renameSession(session.id, options.name);
  }

  await applyTierModel(session.id, options.tiers);

  if (options.thinkingLevel) {
    try {
      await window.sero.agent.setThinkingLevel(session.id, options.thinkingLevel);
    } catch {
      // Model may not support thinking levels — proceed with default.
    }
  }

  options.setupUi?.(session.id);

  await window.sero.agent.prompt(session.id, options.prompt);
  return { sessionId: session.id, sessionPath: session.path };
}
```

- [ ] **Step 3: Add a helper to tear down a session**

Add this helper after `createAndRunSession`:

```typescript
async function teardownSession(sessionId: string, sessionPath: string): Promise<void> {
  try {
    await window.sero.agent.close(sessionId);
  } catch {
    // Session may already be closed.
  }
  try {
    await useSessionStore.getState().deleteSession(sessionPath);
  } catch {
    // Best-effort cleanup.
  }
}
```

- [ ] **Step 4: Rewrite `launchWelcomeSession`**

Replace the entire `launchWelcomeSession` callback with:

```typescript
const launchWelcomeSession = useCallback(async (tiers: ModelTierSettings) => {
  hideLaunchingDialogRef.current = false;
  setErrorMessage(null);
  setLaunchStatusMessage(null);
  setUiPhase('launching');

  let tempSessionId: string | null = null;
  let tempSessionPath: string | null = null;

  try {
    // Phase 1: Run memory setup in a dedicated low-thinking session.
    const temp = await createAndRunSession({
      tiers,
      thinkingLevel: 'low',
      prompt: WELCOME_PROMPT,
    });
    tempSessionId = temp.sessionId;
    tempSessionPath = temp.sessionPath;

    // Phase 2: Tear down the temp session.
    await teardownSession(tempSessionId, tempSessionPath);
    tempSessionId = null;
    tempSessionPath = null;

    // Phase 3: Create the user's clean welcome session.
    const welcome = await createAndRunSession({
      name: 'Welcome',
      tiers,
      prompt: WELCOME_GREETING_PROMPT,
      setupUi: (sessionId) => {
        useSessionStore.getState().setActiveSession(sessionId);
        useAgentStore.getState().focusSession(sessionId);
        useAppStore.getState().setChatPanelOpen(true);
      },
    });

    // Keep the welcome session visible.
    useSessionStore.getState().setActiveSession(welcome.sessionId);
    await finishOnboardingLaunch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Clean up temp session on failure if it's still around.
    if (tempSessionId && tempSessionPath) {
      await teardownSession(tempSessionId, tempSessionPath);
    }

    if (isAuthError(message)) {
      try {
        const refreshedState = await window.sero.onboarding.getState();
        setOnboardingState(refreshedState);

        if (refreshedState.phase === 'ready' && refreshedState.recommendation) {
          const failedProvider = extractFailedProvider(message);
          const nextProvider = refreshedState.recommendation.preferredProvider
            ?? refreshedState.recommendation.tiers.HIGH?.provider
            ?? refreshedState.recommendation.tiers.MED?.provider
            ?? refreshedState.recommendation.tiers.LOW?.provider
            ?? null;

          const failedName = getDisplayProviderName(refreshedState, failedProvider);
          const nextName = getDisplayProviderName(refreshedState, nextProvider);
          const canAutoRetry = !failedProvider || !nextProvider || failedProvider !== nextProvider;

          setLaunchStatusMessage(
            failedName && nextName && failedName !== nextName
              ? `${failedName} stopped working. Switching to ${nextName}.`
              : 'Refreshing your provider before launch.',
          );

          if (canAutoRetry) {
            await window.sero.onboarding.saveTierSelections(refreshedState.recommendation.tiers);
            // Retry the full two-session flow with the new tiers.
            await launchWelcomeSession(refreshedState.recommendation.tiers);
            return;
          }
        }

        setLaunchStatusMessage('Reconnect a provider before onboarding can continue.');
        continueInFlightRef.current = false;
        setIsContinuing(false);
        setUiPhase(deriveUiPhase(refreshedState));
        return;
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        continueInFlightRef.current = false;
        setIsContinuing(false);
        setErrorMessage(retryMessage);
        setUiPhase('error');
        return;
      }
    }

    continueInFlightRef.current = false;
    setIsContinuing(false);
    setErrorMessage(message);
    setUiPhase('error');
  }
}, [finishOnboardingLaunch]);
```

Note: the `onboardingState` dependency is removed from the callback since we now use `refreshedState` throughout (fixing the stale closure from Task 3 as well — if Task 3 was already applied, this supersedes it).

- [ ] **Step 5: Typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors

- [ ] **Step 6: Manual test**

1. Delete `~/.sero-ui/profiles.json` or create a fresh profile to trigger onboarding.
2. Pick a provider and model on the setup screen.
3. Click Continue.
4. Verify the launching dialog appears.
5. Verify a temp session is created (may flash briefly in sidebar), runs the memory prompt, then is deleted.
6. Verify a "Welcome" session appears with an agent greeting.
7. Verify the Dashboard becomes the active app.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/profiles/OnboardingWizard.tsx
git commit -m "feat(onboarding): use dedicated low-thinking session for memory setup"
```

---

### Task 6: Final typecheck and cleanup

**Files:**
- All modified files from Tasks 1-5

- [ ] **Step 1: Full typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors across all packages

- [ ] **Step 2: Check file sizes**

Run:
```bash
wc -l apps/desktop/src/components/profiles/OnboardingWizard.tsx apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx apps/desktop/src/components/profiles/TierPicker.tsx apps/desktop/electron/shared/settings/settings-helpers.ts apps/desktop/src/lib/model-keys.ts
```

Expected: all files under 500 lines.

- [ ] **Step 3: Verify no unused imports**

Skim each modified file for orphaned imports after the refactoring (e.g., `fs`/`path` imports removed from files that no longer have `readSettings`).
