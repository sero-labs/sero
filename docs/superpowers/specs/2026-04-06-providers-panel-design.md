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

Expanding reveals the three tier inputs below the header row:

```
┌─ openai ────────────────────────────── overridden ──┐
│  gpt-5.4-mini                                  [▾]  │
│                                                      │
│  LOW              MED              HIGH               │
│  [gpt-5.4-mini ] [gpt-5.4-mini ] [gpt-5.4-mini  ]  │
│   default: gpt-4.1-mini  default: gpt-5.4  ...      │
│                                                      │
│                               Reset to defaults      │
└──────────────────────────────────────────────────────┘
```

- **Tier inputs** — 3-column grid, each with a label (LOW/MED/HIGH), an input field, and a "default: model-id" hint below showing the built-in value.
- **Placeholder text** — each input uses the built-in default as placeholder, so empty = using default.
- **"Reset to defaults"** — only shown when the provider has overrides. Clears all custom values for that provider.
- **Auto-save** — saves on input blur or Enter keypress. No global save button. Shows brief inline "Saved" feedback text that fades after 1.5s.

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
| `ui/components/ModelDefaultsPanel.tsx` | Rewrite — new collapsed/expanded card layout with auto-save |
| `ui/components/NavSidebar.tsx` | Change "Defaults" label to "Providers" |
| `ui/components/Header.tsx` | Change "Model Defaults" label to "Providers" |
