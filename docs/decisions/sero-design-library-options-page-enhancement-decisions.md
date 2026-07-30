# Design Library options-page enhancement decisions

**Status:** Accepted
**Date:** 2026-07-30
**Scope:** Model choices, settings help text, and media-call control

This is a separate decision entry for options-page enhancement work. It does not reopen the first-release decisions.

## E1 · Model choices use a provider-neutral catalogue

The settings tool returns model choices by media capability. Each choice has an opaque ID and a display label.

The active provider owns its API URL, authentication, pagination, category mapping, and response parsing. The UI does not read provider-specific data.

**Reason.** The current text fields make people find and type endpoint IDs. A provider-neutral contract lets the UI use live choices without coupling it to fal.ai.

**Consequence.** The first adapter reads active models from the fal.ai Model Search API. A later provider can implement the same catalogue contract without changing the settings page.

## E2 · Media model choices use the shared Select

Each media capability uses `Select` from `@sero-ai/ui`.

The list includes the provider default and the current saved value. The current value stays available if it is absent from the latest provider response.

**Reason.** Model selection is a fixed choice from live provider data. Free text is error-prone and does not match Sero controls.

## E3 · Count settings share one stepper

The Create Design variant count and **Media calls per run** use one local `CountStepper` component.

**Reason.** Both controls change a bounded integer. One control keeps keyboard, disabled, icon, and boundary behaviour consistent.

## E4 · Remove redundant model help text

The options page removes the help lines under Librarian model, Design model, and Media models.

**Reason.** The labels and control values explain these settings. The extra text adds visual noise.
