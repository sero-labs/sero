# Design Library options-page enhancement decisions

**Status:** Accepted
**Date:** 2026-07-30
**Scope:** Model choices, settings help text, and media-call control

This is a separate decision entry for options-page enhancement work. It does not reopen the first-release decisions.

## E1 · Model choices use a provider-neutral catalogue

The settings tool returns model choices by media capability. Each choice has an opaque ID and a display label.

The active provider owns its API URL, catalogue access, category mapping, and response parsing. The UI does not read provider-specific data.

**Reason.** The current text fields make people find and type endpoint IDs. A provider-neutral contract lets the UI use live choices without coupling it to fal.ai.

**Consequence.** The first adapter reads active models from the fal.ai Model Search API. A later provider can implement the same catalogue contract without changing the settings page.

## E2 · Media model choices use the shared Combobox

Each media capability uses the single-choice `Combobox` from `@sero-ai/ui`. The menu is searchable and groups models by provider.

The list includes the provider default and the current saved value. The current value stays available if it is absent from the latest provider response. A user can also enter a model endpoint that is not in the working set.

**Reason.** Model selection is a fixed choice from live provider data. A long Select is slow to open and hard to scan. Search and provider groups make the same catalogue practical.

## E3 · Count settings share one stepper

The Create Design variant count and **Media calls per run** use one local `CountStepper` component.

**Reason.** Both controls change a bounded integer. One control keeps keyboard, disabled, icon, and boundary behaviour consistent.

## E4 · Remove redundant model help text

The options page removes the help lines under Librarian model, Design model, and Media models.

**Reason.** The labels and control values explain these settings. The extra text adds visual noise.

## E5 · Capability help stays behind an info tooltip

Each media-model label has an info icon. Its tooltip explains where that capability is used.

**Reason.** The short labels keep the page easy to scan, but terms such as **Remix** and **Animate** do not explain their input and output. A tooltip gives this detail only when it is needed.

**Consequence.** Each icon supports pointer hover and keyboard focus and has an accessible name.

## E6 · Catalogue discovery is bounded and cached

The fal.ai adapter reads one anonymous working set of active models and classifies it by capability. It caches a successful result across Settings visits. Retry asks the adapter to refresh the cache.

**Reason.** Crawling every page for several categories exceeds the public endpoint's rate limit. The model-discovery endpoint does not need the generation key. One bounded request avoids request bursts and prevents a stale key from blocking discovery.

**Consequence.** Settings shows the provider error and a Retry action when discovery fails. Manual endpoint entry and saved choices stay available.

## E7 · The shared stepper has accessible value entry

The stepper is an accessible named group. **Media calls per run** also provides direct numeric entry inside the group.

**Reason.** Increment and decrement buttons are useful for small changes. Direct entry prevents many clicks across the 0–20 range.
