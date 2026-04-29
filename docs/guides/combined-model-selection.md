# Combined Model Selection Guide

This guide explains how model selection now works across Sero.

## Overview

Sero now uses one shared model system across:

- onboarding
- Admin → Model
- chat sessions
- Admin → Agents

The main idea is:

1. Connect one or more providers.
2. Pick global `LOW`, `MED`, and `HIGH` models.
3. Set a thinking level for each tier.
4. Reuse those tiers across the app.
5. Override them only when you need to.

## Core Concepts

## 1. Available models are live

Every picker uses the models that are currently available from your connected providers.

If you log out of a provider, remove a key, or a model becomes unavailable, Sero keeps your saved choice long enough to warn you instead of silently hiding the problem.

## 2. `LOW`, `MED`, and `HIGH` are your global tiers

These are your reusable defaults:

- `LOW` — fast, lightweight work
- `MED` — balanced, general-purpose work
- `HIGH` — strongest option for complex work

Each tier stores:

- a model
- its own thinking level

That means `LOW`, `MED`, and `HIGH` can each behave differently.

## 3. Thinking is now tier-based

There is no longer one global thinking level for everything.

Instead:

- `LOW` has its own thinking level
- `MED` has its own thinking level
- `HIGH` has its own thinking level

Sero only lets each tier use thinking levels supported by its selected model.

## 4. Chat can still be changed per session

The chat model selector is still session-level.

You can:

- switch the current session to another model
- change the current session thinking level

This does not rewrite your global tier setup unless you go to Admin → Model and save changes there.

---

## Where to Set Things Up

## Onboarding

When you first set up a profile, Sero asks you to choose:

- `LOW` model + thinking
- `MED` model + thinking
- `HIGH` model + thinking

Use onboarding to create a solid starting point.

Recommended pattern:

- `LOW`: a fast/cheap model, usually with low or off thinking
- `MED`: your everyday default
- `HIGH`: your strongest reasoning model

If a provider is not ready, use `Manage providers`, reconnect it, then continue.

## Admin → Model

This is the main place to manage your global defaults later.

Open:

- `Admin`
- `Model`

You will see three cards:

- `Low`
- `Medium`
- `High`

For each one you can:

1. choose a model
2. choose a thinking level for that tier

Then click:

- `Save` to apply changes
- `Reset` to discard unsaved edits

Use this page whenever you want to change your long-term defaults.

---

## How Chat Uses Models

In a chat session, open the model picker in the title area of the chat panel.

There you can:

- search available models
- switch the current session to another model
- set the current session thinking level

Use this when you want a one-off change for the current conversation.

Examples:

- switch to a faster model for quick questions
- switch to a stronger model for a difficult task
- temporarily increase thinking for a tricky prompt

This is best treated as a session override, not your permanent configuration.

---

## How Agents Use Models

Open:

- `Admin`
- `Agents`
- select an agent

The `Model choice` field is now intentionally simple.

Options:

- `Use Sero default (recommended)`
- `LOW — fast`
- `MED — balanced`
- `HIGH — strongest`
- `Pick a specific model…`

## What each option means

### Use Sero default

Best when you do not want to tune the agent yet.

Use this for most agents unless you have a strong reason to pin them.

### LOW / MED / HIGH

Best when you want the agent to follow your global tier setup.

Important:

- the agent inherits the tier's model
- the agent also inherits that tier's thinking level
- the `Thinking` selector is disabled in these modes on purpose

This keeps agent behavior aligned with your Admin → Model configuration.

### Pick a specific model…

Use this only when the agent truly needs one exact model.

When you choose a pinned model:

- the agent stops following the tier model choice
- the `Thinking` selector becomes active
- you can pick a thinking level supported by that specific model

This is useful for specialist agents that should always run on one known model.

---

## Recommended Everyday Workflow

## For most users

1. Set up `LOW`, `MED`, and `HIGH` in onboarding or Admin → Model.
2. Leave most agents on `Use Sero default` or choose one of the tiers.
3. Change chat sessions directly only when needed.

## Good starting pattern

- `LOW`: quick utility model
- `MED`: your everyday model
- `HIGH`: strongest reasoning model

Then:

- use `MED` for most agents
- use `LOW` for lightweight helpers
- use `HIGH` for planning/research/review agents

---

## Warnings and What They Mean

Sero now shows warnings instead of silently dropping broken selections.

Common cases:

### “Model is not currently available”

Usually means:

- you logged out of that provider
- the API key was removed
- the provider is temporarily unavailable
- the model no longer exists for that provider

Fix:

- reconnect the provider
- or choose another model and save

### Thinking level warning

Usually means:

- the selected model does not support the chosen thinking level

Fix:

- lower the thinking level
- or choose a model with stronger reasoning support

### Agent warning

Usually means:

- the agent points to a tier that is unset or broken
- the agent is pinned to a model that is unavailable

Fix:

- repair the global tier in Admin → Model
- or change the agent to another tier/model

---

## What Happens If a Provider Is Reconnected

If you disconnect a provider and later reconnect it:

- your saved tier choices can become valid again
- chat and admin model views will refresh and show those models again

If you still see a warning after reconnecting, reopen the relevant page or save a fresh selection.

---

## When to Use Tiers vs Specific Models

Use tiers when:

- you want consistency across the app
- you want to swap providers/models later without editing every agent
- you want agent behavior to follow your global defaults

Use a specific pinned model when:

- one agent truly depends on one exact model
- you want that agent to have its own thinking setting
- you are intentionally opting out of the shared tier behavior

In general, prefer tiers first and pinned models second.

---

## Quick Reference

## Change your long-term defaults

Go to:

- `Admin` → `Model`

## Change only the current chat session

Use:

- the chat model picker

## Make an agent follow your shared defaults

Go to:

- `Admin` → `Agents`
- choose `LOW`, `MED`, or `HIGH`

## Make an agent always use one exact model

Go to:

- `Admin` → `Agents`
- choose `Pick a specific model…`
- choose the model
- choose the thinking level

---

## Best Practices

- Keep `LOW`, `MED`, and `HIGH` meaningful and distinct.
- Prefer tier-based agent configs unless you need a pinned model.
- Treat chat changes as temporary session overrides.
- Use Admin → Model as the source of truth for your shared defaults.
- If you see warnings, fix them instead of assuming Sero silently handled them.

With that setup, model selection stays predictable across onboarding, admin, chat, and agents.
