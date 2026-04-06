# Providers Panel Redesign

**Date:** 2026-04-06
**Status:** Draft

## Goal

Replace the current ModelDefaultsPanel with a clean, progressive-disclosure Providers panel that shows providers as compact cards, expanding to reveal tier configuration only when needed.

## Why

The current UI dumps all providers with all 3 tier inputs visible, a cryptic "Effective:" summary, confusing "Clear override" buttons, and a global save/reload flow. It's overwhelming for what is usually a one-time setup task.

## Design

### Collapsed State (Default)

Each provider is a single compact row:

```
┌─ anthropic ─────────────────────────────────────┐
│  claude-sonnet-4-6                          [▸]  │
└──────────────────────────────────────────────────┘
```

- **Provider name** — top-left, `text-sm font-medium`
- **Representative model** — the effective HIGH-tier model shown below or beside the name. This is the most meaningful model to display since HIGH is the primary/default tier.
- **Chevron** — right side, `▸` collapsed / `▾` expanded
- **"overridden" badge** — subtle badge shown if the user has any custom values for this provider. Uses `text-primary` styling.
- Clicking anywhere on the row toggles expand/collapse.

### Expanded State

Expanding reveals the three tier selectors below the header row:

```
┌─ openai ────────────────────────────── overridden ──┐
│  gpt-5.4-mini                                  [▾]  │
│                                                      │
│  LOW                MED                HIGH           │
│  ┌─────────────┐   ┌─────────────┐   ┌────────────┐ │
│  │ gpt-5.4-mini▾│   │ gpt-5.4-mini▾│   │gpt-5.4-mini▾│ │
│  └─────────────┘   └─────────────┘   └────────────┘ │
│   default: gpt-4.1-mini  default: gpt-5.4  ...      │
│                                                      │
│                               Reset to defaults      │
└──────────────────────────────────────────────────────┘
```

### Tier Model Selectors

Each tier uses a **Popover-based model picker** — the same UX pattern as the main ModelSelector (`apps/desktop/src/components/layout/ModelSelector.tsx`). This replaces the raw text inputs.

**Trigger button:** Displays the current effective model name (or "default: model-id" in muted text if no override). Clicking opens the picker popover.

**Popover content:** A compact searchable list of available models for that provider:

```
┌────────────────────────────┐
│ 🔍 Search models…          │
├────────────────────────────┤
│ ● gpt-5.4                  │
│   gpt-5.4-mini             │
│   gpt-4.1                  │
│   gpt-4.1-mini             │
│   o3                        │
│   o4-mini                   │
├────────────────────────────┤
│ ✎ Custom model ID…         │
└────────────────────────────┘
```

- **Model list** — sourced from the available models data for this provider (same data the main ModelSelector uses, via `window.sero.models.listAvailable()` or equivalent IPC). Each item is a button; clicking selects it and closes the popover.
- **Selected indicator** — check mark on the currently selected model (matches ModelSelector's `Check` icon pattern).
- **Search** — filters the model list by name/ID as the user types.
- **"Custom model ID..."** — footer action that switches the popover to a text input for entering an arbitrary model ID (for models not in the known list). Pressing Enter confirms.
- **"default" fallback display** — if no override is set, the trigger button shows the built-in default model name in muted text with a "(default)" suffix, making it clear this value comes from defaults, not a user choice.

**Data source:** The host app already exposes `window.sero.models.list(): Promise<AvailableModelGroup[]>` (see `apps/desktop/src/types/electron.d.ts:374-377`). Each `AvailableModelGroup` has `{ provider, displayName, logo, models: ModelInfo[] }` where `ModelInfo` has `{ modelId, name, provider, reasoning }`. Add a `models.list()` method to `SeroApi` in `useSeroFiles.ts`. Filter the returned groups by the current provider's ID to populate that provider's tier picker. If a provider has no available models (not authenticated), fall back to a plain text input for that tier.

### Auto-Save & Persistence

- **Auto-save** — selecting a model from the picker immediately saves. No global save button.
- All current overrides are collected and saved via `providerDefaults.setGlobalDefaults()`
- Inline "Saved" feedback appears next to the provider name, fades after 1.5s
- On error, inline error text in `text-destructive`
- State reloaded after save to get fresh effective values

### Other Expanded State Details

- **"Reset to defaults"** — only shown when the provider has overrides. Clears all custom values for that provider.
- **Default hint** — below each tier selector, `text-[10px] text-muted-foreground/60` showing "default: model-id" so users know what they'll get if they clear the override.

### Add Provider

A `+ Add provider` button at the bottom of the list. Clicking it reveals an inline input row:

```
│  Provider ID: [_______________]  [Add]  [Cancel]  │
```

After adding, the new provider appears in the list in expanded state so the user can immediately set tier values.

### Nav Sidebar

Rename:
- `modelDefaults` section label: "Defaults" → "Providers"
- `SECTION_LABELS` in Header: "Model Defaults" → "Providers"

The `AdminSection` type value stays `modelDefaults` (no state migration needed).

### Empty State

If no providers exist at all (unlikely but possible):

```
No providers configured yet.
[+ Add provider]
```

### Auto-Save Flow

1. User edits a tier input and blurs or presses Enter
2. All current overrides are collected and saved via `providerDefaults.setGlobalDefaults()`
3. Inline "Saved" text appears next to the provider name, fades after 1.5s
4. On error, inline error text appears in `text-destructive`
5. State is reloaded after save to get fresh effective values

### What's Removed

- Global "Save defaults" / "Reload" buttons
- "Effective: LOW x · MED y · HIGH z" summary line
- "Clear override" button (replaced with "Reset to defaults", only when expanded)
- Top-level "Add provider id..." input field

### What's Unchanged

- Same IPC bridge: `providerDefaults.get()`, `setGlobalDefaults()`
- Same data model: `ProviderModelDefaults` = `Record<string, Partial<Record<'LOW'|'MED'|'HIGH', string>>>`
- Same `ProviderDefaultsState` shape with `builtInDefaults`, `globalDefaults`, `effectiveDefaults`
- File stays at `ui/components/ModelDefaultsPanel.tsx` (component name unchanged to avoid touching AdminApp routing)

## File Changes

| File | Action |
|------|--------|
| `ui/components/ModelDefaultsPanel.tsx` | Rewrite — collapsed/expanded provider cards, popover-based tier selectors, auto-save |
| `ui/components/TierModelPicker.tsx` | **NEW** — Popover-based model picker for a single tier (search, model list, custom ID fallback) |
| `ui/hooks/useSeroFiles.ts` | Add `models.list()` to `SeroApi` interface |
| `ui/components/NavSidebar.tsx` | Change "Defaults" label to "Providers" |
| `ui/components/Header.tsx` | Change "Model Defaults" label to "Providers" |
