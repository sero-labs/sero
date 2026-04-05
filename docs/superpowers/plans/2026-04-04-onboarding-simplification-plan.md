# Onboarding Simplification + Resilience Plan

## Goal

Make onboarding feel like a fast, polished "ready in one click" flow for the
common case, while preserving explicit model choice for users who want to tune
it.

This plan builds on `docs/superpowers/specs/2026-04-04-onboarding-resilience-analysis.md`
but shifts the emphasis from failure recovery alone to **default-first UX**:

- onboarding should **pre-select sensible models automatically**
- users should only need to make choices when they want to
- expired or broken provider auth should be surfaced clearly and recoverably
- cloned and non-cloned profiles should both follow the same mental model

---

## Review of the Existing Analysis

The analysis doc is directionally correct. Its strongest points are:

1. It correctly identifies that `ModelRegistry.getAvailable()` is not a health
   check.
2. It correctly calls out silent fallback behavior as confusing.
3. It correctly identifies cloned `auth.json` as a major source of stale-token
   onboarding failures.
4. It usefully separates onboarding-specific fixes from broader model-selection
   resilience work.

### What is missing

The current analysis focuses mainly on **how failures should be handled**, but
not enough on **how to reduce the number of decisions and failure points in the
first place**.

For a sleek onboarding flow, we should add:

- a **default-first recommendation system**
- a single **preflight assessment** that determines what the user actually
  needs to do
- progressive disclosure so most users never see the full tier editor unless
  they ask for it
- a unified path for:
  - brand-new profiles with no `auth.json`
  - profiles cloned from another profile
  - profiles relying on env-backed credentials or local models

---

## Current Workflow Problems

## 1. Too many explicit decisions too early

Today, onboarding often asks the user to:

1. think about providers
2. sign in
3. think about LOW / MED / HIGH tiers
4. manually select models
5. only then continue to memory bootstrap

That is flexible, but it is not sleek.

## 2. The tier picker starts empty

Even when the system already has enough information to make a strong choice,
the tier picker makes the user populate everything manually.

This creates unnecessary friction for:

- first-time users
- users who just want "the recommended option"
- users who cloned a profile and expect it to work immediately

## 3. Provider state is binary instead of actionable

The UI mostly distinguishes between:

- has credentials
- does not have credentials

But onboarding really needs richer states:

- healthy
- broken / expired
- env-backed
- local-only
- not configured

Without these states, the UX becomes misleading.

## 4. Broken cloned auth is discovered too late

Cloned profiles currently inherit `auth.json` and `modelTiers`, but their first
real validation often happens during `setModel()` or the first prompt.

That means the onboarding flow can look successful up to the point where the
welcome session fails.

## 5. The "Skip" semantics are muddy

Right now, skip can mean:

- skip auth
- skip tier selection
- let the system guess

That makes the flow harder to reason about.

## 6. Clone vs non-clone flows are inconsistent

- Cloned profile: may appear ready, then fail later
- Fresh profile: must authenticate first, then choose models

These should feel like variations of the same flow, not separate products.

---

## UX Principles for the New Flow

## 1. One-click fast path

If Sero can determine a usable setup, the primary CTA should simply be:

- **Continue**

Not "choose three models first".

## 2. Progressive disclosure

Show recommended defaults first. Hide advanced model customization behind:

- **Customize models**

## 3. Validate once, early

Run a single onboarding preflight to determine:

- what models are actually usable
- which providers are broken
- which tier defaults should be preselected
- whether user action is needed at all

## 4. Explain failures in provider language

Never fail with "model unavailable" when the actual issue is:

- "Anthropic credentials expired"
- "OpenAI key missing"
- "Imported credentials could not be validated"

## 5. Preserve control

The fast path should be automatic, but users must still be able to:

- override LOW / MED / HIGH choices
- add another provider during onboarding
- re-auth a single broken provider
- continue with a subset of healthy providers

---

## Proposed Target Flow

## Step 0 — Onboarding Preflight (new, automatic)

Before rendering the onboarding UI, run a single host-side assessment that:

1. inspects available providers and model sources
2. performs lightweight health checks where possible
3. validates existing tier selections if present
4. computes recommended tier defaults
5. returns a renderer-ready onboarding state

This should become the single source of truth for onboarding.

### Preflight output should include

- `healthyProviders`
- `brokenProviders`
- `availableModelGroups`
- `recommendedTiers`
- `existingTierValidity`
- `hasAnyUsableModels`
- `needsAuth`
- `hasImportedCredentials`
- `hasImportedBrokenCredentials`

---

## Step 1 — "You're almost ready" screen

If preflight finds at least one usable model, do **not** drop the user into an
empty tier picker.

Instead show a compact recommendation screen:

- summary of connected healthy providers
- summary of broken providers, if any
- recommended LOW / MED / HIGH selections, already filled in
- primary button: **Continue**
- secondary button: **Customize models**
- tertiary action: **Add / reconnect provider**

### Example

- LOW: OpenAI / GPT-4.1 Mini
- MED: OpenAI / GPT-5.4
- HIGH: OpenAI / GPT-5.4

Or, if only Google is healthy:

- LOW: Gemini 2.5 Flash
- MED: Gemini 2.5 Pro
- HIGH: Gemini 2.5 Pro

The key change is that onboarding becomes confirmatory by default, not form-like.

---

## Step 2 — Optional advanced customization

If the user clicks **Customize models**, open the current tier editor UI with:

- all three tiers pre-populated
- "Use same model for all tiers" still available
- only healthy / usable models shown by default
- broken providers visible separately as disabled / warning entries, not mixed
  into the healthy list

This preserves the current flexibility, but makes it opt-in.

---

## Step 3 — Provider auth / reconnect when needed

If preflight finds no usable models, or if the user wants to fix broken
providers, show a provider auth screen with richer status:

- healthy
- expired / broken
- configured from env
- local models available
- not configured

### Desired actions

- **Connect provider**
- **Reconnect [provider]**
- **Use current healthy providers only**
- **Continue with env/local models** when available

This means onboarding should stop framing auth as just "logged in or not".

---

## Step 4 — Launch welcome memory session

Only after a usable model setup is confirmed should Sero launch the welcome
memory session.

At that point:

- selected tiers are already saved
- the welcome session uses the validated recommendation
- provider failures become exceptional, not part of the normal path

---

## Provider Default Model Strategy

This is the core simplification lever.

## Proposal

Introduce a provider-defaults registry that defines the recommended models per
provider and per tier.

Example shape:

```ts
{
  openai: {
    LOW: 'gpt-4.1-mini',
    MED: 'gpt-5.4',
    HIGH: 'gpt-5.4',
  },
  google: {
    LOW: 'gemini-2.5-flash',
    MED: 'gemini-2.5-pro',
    HIGH: 'gemini-2.5-pro',
  },
  anthropic: {
    LOW: 'claude-haiku-4-5',
    MED: 'claude-sonnet-4-6',
    HIGH: 'claude-sonnet-4-6',
  }
}
```

### How recommendations should be chosen

Priority order:

1. Existing saved tier choice, if still healthy
2. Imported cloned tier choice, if still healthy
3. Provider-default tier choice from the healthiest / preferred provider
4. Capability-ranked fallback across all healthy models

### Why this helps

It lets onboarding always start with a real, prefilled answer.

Users can still edit it, but they no longer have to build their setup from
scratch.

---

## Make Provider Defaults Configurable

The request says provider defaults should be configurable. I agree.

## Recommended scope

### Phase 1

Ship built-in defaults in code, but support optional settings overrides in
`settings.json`, e.g.:

```json
{
  "sero": {
    "providerModelDefaults": {
      "openai": {
        "LOW": "gpt-4.1-mini",
        "MED": "gpt-5.4",
        "HIGH": "gpt-5.4"
      }
    }
  }
}
```

### Phase 2

Expose a settings UI for editing these provider defaults.

This gives us immediate flexibility without bloating onboarding itself.

---

## Expired Auth Handling Plan

## Desired behavior

Expired auth should be treated as a first-class onboarding state, not an edge
case discovered during prompt execution.

## Recommended approach

### 1. Add provider health assessment

Introduce a lightweight provider-health pass used by onboarding.

Possible states:

- `healthy`
- `broken_expired`
- `broken_invalid`
- `env`
- `local`
- `missing`
- `unknown`

### 2. Probe in the background, not with a blocking spinner-first UX

The onboarding screen should render quickly, then update provider states as the
health checks complete.

If a provider cannot be checked quickly, mark it `unknown` initially and avoid
blocking the entire flow on it.

### 3. Targeted recovery actions

For broken providers, show:

- provider name
- short explanation
- **Reconnect** action
- optional **Ignore for now** action

### 4. Do not silently promote broken providers into recommendations

Broken providers should never be used to prefill tier defaults.

---

## Fresh Profile Without Cloned `auth.json`

This should become the simplest flow.

## Desired experience

1. User creates profile
2. If env/local models already exist, Sero recommends defaults immediately
3. Otherwise Sero asks them to connect one provider
4. After auth succeeds, Sero pre-selects recommended tiers automatically
5. User clicks Continue
6. Memory bootstrap starts

That means fresh profiles should not land in an empty tier step either.

---

## Renderer / UX Changes

## Replace the current onboarding state machine with:

- `checking`
- `ready` (recommended defaults available)
- `customize`
- `auth`
- `launching`
- `error`

This is simpler than the current "auth then tiers then maybe fail then fallback"
mental model.

## The new primary onboarding view should show

- headline: ready state
- recommended models summary
- provider health summary
- Continue / Customize / Add provider actions

The current `TierPicker` can remain, but it should become an advanced editor,
not the first thing every user sees.

---

## Host / Data Model Changes

## 1. Add a dedicated onboarding IPC surface

Instead of spreading onboarding logic across `auth.getProviders()`,
`models.list()`, `modelTiers.get()`, and `profiles.needsOnboarding()`, add a
single onboarding-specific API.

Example:

- `window.sero.onboarding.getState()`
- `window.sero.onboarding.saveSelections()`
- `window.sero.onboarding.reconnectProvider(providerId)`

This keeps renderer logic thin and centralizes the rules.

## 2. Add provider defaults registry

Suggested location:

- `apps/desktop/electron/shared/settings/provider-model-defaults.ts`

Responsibilities:

- built-in provider defaults
- settings override merge
- recommend LOW / MED / HIGH for a healthy provider set

## 3. Add onboarding preflight module

Suggested location:

- `apps/desktop/electron/features/onboarding/`

Responsibilities:

- provider health checks
- imported tier validation
- recommendation generation
- onboarding state assembly

## 4. Extend auth/provider metadata

Current `auth.getProviders()` only exposes basic flags. We likely need richer
provider state metadata, either by extending auth IPC or by keeping it scoped to
the new onboarding API.

---

## Profile Clone Strategy

To keep profile creation sleek, I recommend **not** adding extra clone-time
modals first.

Instead:

1. keep cloning `auth.json` + `modelTiers`
2. run validation in the first-launch onboarding preflight
3. show imported broken providers clearly there
4. let the user reconnect only the providers that failed

This avoids adding friction to profile creation while still making cloned auth
failures understandable.

### Optional follow-up

Later, we can add clone-time validation if we want early warnings before the
profile switch, but I would not make that the first implementation.

---

## Proposed Phases

## Phase 1 — Fast-path simplification

Goal: make onboarding feel one-click for healthy setups.

### Deliverables

- provider defaults registry
- recommended tier generation
- prefilled onboarding state
- new "ready" screen with Continue / Customize
- TierPicker converted to advanced editor

## Phase 2 — Auth resilience

Goal: make broken providers obvious and recoverable.

### Deliverables

- provider health states
- background health probing
- broken provider messaging and reconnect actions
- recommendations exclude broken providers

## Phase 3 — General resilience outside onboarding

Goal: align the rest of the app with onboarding behavior.

### Deliverables

- model selector surfaces auth failures clearly
- session-start model validation
- better targeted fallback UX in normal chat flows

---

## Concrete Implementation Checklist

## Backend / Electron

- add provider-default registry + override support
- add onboarding preflight service
- define onboarding IPC types
- compute recommended tiers from:
  - saved tiers
  - imported tiers
  - provider defaults
  - healthy model set
- add provider health model and caching policy
- ensure onboarding can reason about env/local model sources

## Renderer

- replace tier-first flow with ready/customize/auth flow
- build recommended setup summary UI
- prefill TierPicker from recommendations
- show broken providers inline with reconnect actions
- keep customization accessible but secondary

## Validation / Testing

Test scenarios:

1. fresh profile, no auth
2. fresh profile, env-backed API key
3. fresh profile, local models only
4. cloned profile, healthy auth + healthy tiers
5. cloned profile, broken auth + healthy fallback provider
6. cloned profile, all imported providers broken
7. imported tiers partially invalid
8. user customizes recommendations before continue
9. provider expires between preflight and welcome session launch

---

## Recommendation

I recommend we implement this around a single product rule:

> **Onboarding should always begin with Sero's best recommendation, not an empty form.**

That gives us the sleek/simple path by default, while still preserving full
control behind a single "Customize models" action.

If you want, I can turn this into a tighter implementation spec next, with
proposed IPC shapes, UI states, and file-by-file tasks.
