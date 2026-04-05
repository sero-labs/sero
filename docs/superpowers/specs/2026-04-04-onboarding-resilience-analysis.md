# Onboarding Auth Resilience — Problem Analysis

## Problem

When creating a new profile with cloned credentials, the onboarding flow is
fragile around expired/stale OAuth tokens. The system treats models as
"available" based on having an auth entry, but doesn't verify the token
actually works. This leads to:

1. **Silent failures**: `setModel` throws because the provider's token is
   expired, but errors are caught and swallowed. The user sees "nothing
   happened" or a wrong model selected.

2. **Misleading model list**: The tier picker and model selector show models
   from providers with expired tokens. Users select these models, the
   selection silently fails, and the system falls back to an arbitrary model.

3. **Cascading failures during onboarding**: The memory bootstrap prompt uses
   whatever model `ensureInfra` picked (not the user's tier choice), fails
   with an auth error, triggers the fallback retry path, and eventually
   either shows the auth screen or silently gives up.

4. **No feedback loop**: When a provider's auth is broken, the user is never
   told which provider failed or offered the chance to re-authenticate just
   that provider.

## Root Causes

- **`ModelRegistry.getAvailable()`** checks for the presence of an auth
  entry, not whether the token is valid. An expired OAuth token still makes
  all models from that provider appear "available."

- **Profile cloning copies auth.json verbatim** — OAuth tokens may already be
  expired at copy time, or may expire before the user creates their first
  session.

- **`setModel` errors are swallowed** in the onboarding wizard's
  `applyTierModel` and in the agent store's `setModel` action. The UI shows
  no error toast or dialog.

- **No auth validation at session start** — the first API call discovers the
  broken token, but by then the session is already open with the wrong model.

## Ideal Solution

### 1. Auth validation on profile clone

When cloning credentials to a new profile, validate each provider's token
before copying. Mark stale tokens and present the user with a choice:

- "These providers have expired credentials: [Anthropic, OpenAI Codex].
  Would you like to re-authenticate now, or skip them?"

This prevents broken tokens from entering the new profile silently.

### 2. Provider health check in the tier picker

Before showing the tier picker, run a lightweight auth probe per provider
(e.g. a minimal model list API call). Filter out providers with broken auth
and show a warning:

- "Some providers couldn't be reached (expired tokens). Models from these
  providers are hidden. You can re-authenticate in settings."

### 3. Graceful model switch with user feedback

When `setModel` fails during onboarding:

- Show an inline error: "Couldn't use [GPT-5.4 Mini] — [provider] auth may
  have expired."
- Offer: "Try a different model" (reopen tier picker) or "Re-authenticate
  [provider]" (open auth dialog for that specific provider).

Don't silently fall back to an arbitrary model — that's confusing.

### 4. Auth error detection in the model selector

When clicking a model in the ModelSelector fails, show a toast:

- "Couldn't switch to [model name] — [provider] authentication failed.
  Re-authenticate via Settings > Providers."

Currently the click does nothing with no feedback.

### 5. Stale token detection at session start

Before sending the first prompt in a new session, validate the current
model's auth. If it fails, immediately try switching to another model AND
inform the user which provider failed. This is similar to what the Google
plugin's `stale token detection` does (PR #120).

## Scope

- Items 1-3 are onboarding-specific and should be part of the tier system work
- Items 4-5 are general resilience improvements that benefit all users, not
  just onboarding — these could be separate follow-up work

## Files Involved

- `apps/desktop/src/components/profiles/OnboardingWizard.tsx` — onboarding flow
- `apps/desktop/src/components/profiles/TierPicker.tsx` — model selection
- `apps/desktop/src/components/layout/ModelSelector.tsx` — main model selector
- `apps/desktop/electron/ipc/agent/core/agent-model-context.ts` — setModel handler
- `apps/desktop/electron/ipc/platform/auth/auth.ts` — getProviders handler
- `apps/desktop/electron/ipc/workspace/profiles.ts` — profile clone handler
- `apps/desktop/electron/shared/infra/shared-infra.ts` — pickFirstAvailableModel
