# Providers Panel Redesign

**Date:** 2026-04-06
**Status:** Draft

## Goal

Replace the current ModelDefaultsPanel with a two-section Providers panel: global tier selectors at the top (the main thing users care about), and a provider list below showing health status and optional per-provider overrides.

## Why

The current UI dumps every provider with all 3 tier inputs visible, a cryptic "Effective:" summary, and a confusing global save flow. Users have to understand the per-provider tier model to do anything. Most users just want to pick which models to use at each quality level.

## Design

### Overall Layout

```
┌──────────────────────────────────────────────────────────┐
│  Providers                                                │
│  Configure which models are used at each quality tier.    │
│                                                           │
│  ┌─ GLOBAL TIERS ──────────────────────────────────────┐ │
│  │                                                      │ │
│  │  LOW              MED              HIGH               │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │ │
│  │  │gpt-4.1-mini▾│  │claude-son…▾│  │ claude-opus-4 ▾│ │ │
│  │  │ OpenAI      │  │ Anthropic  │  │ Anthropic      │ │ │
│  │  └────────────┘  └────────────┘  └────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  PROVIDERS                                                │
│                                                           │
│  ┌─ anthropic ──── ● healthy ───────────────────────┐   │
│  │  claude-sonnet-4-6                           [▸]  │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─ openai ──── ● healthy ──────────────────────────┐   │
│  │  gpt-5.4-mini                                [▸]  │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─ google ──── ⚠ expired ──────────────────────────┐   │
│  │  Token expired · Re-authenticate             [▸]  │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  [+ Add provider]                                         │
└──────────────────────────────────────────────────────────┘
```

### Section 1: Global Tiers

Three model selectors across the top, one per tier (LOW / MED / HIGH). Each can pick **any model from any authenticated provider**. This is what the agent actually uses.

**Tier selector trigger:** A button showing:
- The selected model name (e.g. "claude-sonnet-4-6")
- The provider name below in muted text (e.g. "Anthropic")
- Chevron indicator

**Tier selector popover:** Uses the same Popover-based model picker pattern as the main ModelSelector (`apps/desktop/src/components/layout/ModelSelector.tsx`):

```
┌────────────────────────────┐
│ 🔍 Search models…          │
├────────────────────────────┤
│ ANTHROPIC                   │
│   ● claude-opus-4           │
│     claude-sonnet-4-6       │
│     claude-haiku-4-5        │
│ OPENAI                      │
│     gpt-5.4                 │
│     gpt-5.4-mini            │
│     o3                      │
│ GOOGLE                      │
│     gemini-2.5-pro          │
│     gemini-2.5-flash        │
├────────────────────────────┤
│ ✎ Custom model ID…         │
└────────────────────────────┘
```

- Models grouped by provider with provider name as section header
- Search filters across all providers by model name/ID
- Check mark on currently selected model
- "Custom model ID..." footer for arbitrary model IDs
- Only shows models from healthy/authenticated providers (unhealthy providers excluded from picker, with a note if relevant)

**Auto-save:** Selecting a model saves immediately via `providerDefaults.setGlobalDefaults()`. Brief inline "Saved" feedback.

**Data source:** `window.sero.models.list()` returns `AvailableModelGroup[]` with `{ provider, displayName, logo, models: ModelInfo[] }`. Add `models.list()` to `SeroApi` in admin plugin.

### Section 2: Providers

A list of all providers the user has configured (authenticated or with API keys). Each provider is a compact card.

#### Collapsed State (Default)

```
┌─ anthropic ──── ● healthy ───────────────────────┐
│  claude-sonnet-4-6                           [▸]  │
└───────────────────────────────────────────────────┘
```

- **Provider name** — `text-sm font-medium`
- **Health badge** — next to provider name:
  - `● healthy` — green dot, muted text
  - `⚠ expired` — amber warning icon, amber text
  - `⚠ invalid` — amber warning icon
  - `○ missing` — muted dot, "Not configured"
- **Default model** — the provider's effective HIGH-tier model (the representative model)
- **Chevron** — expand/collapse
- Click anywhere to toggle

#### Unhealthy Provider State

When a provider has issues, the collapsed card shows the problem and a resolution action instead of a model name:

```
┌─ google ──── ⚠ expired ─────────────────────────┐
│  Token expired · Re-authenticate            [▸]  │
└──────────────────────────────────────────────────┘
```

- **"Re-authenticate"** — clickable link that triggers `window.sero.auth.login(providerId)` for OAuth providers
- **"Add API key"** — for API-key providers that are missing, shows inline input or links to Settings
- **Message** — from `ProviderHealthInfo.message` if available

**Health data source:** `window.sero.auth.getProviders()` returns `AuthProvidersResponse` with OAuth + API key provider lists. Each has auth status. Cross-reference with `ProviderHealthInfo` from onboarding state if available, or derive health from `hasKey`/`isLoggedIn` status.

Add `auth.getProviders()` and `auth.login(providerId)` to `SeroApi`.

#### Expanded State

Expanding reveals per-provider tier overrides — for the rare case where someone wants different models per provider (e.g. "when using OpenAI specifically, use gpt-5.4 for HIGH instead of gpt-5.4-mini").

```
┌─ openai ──── ● healthy ───── overridden ─────────┐
│  gpt-5.4-mini                                [▾]  │
│                                                    │
│  LOW              MED              HIGH             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │gpt-5.4-mini▾│  │gpt-5.4-mini▾│  │gpt-5.4-mini▾│  │
│  └────────────┘  └────────────┘  └────────────┘  │
│   default: gpt-4.1-mini  default: gpt-5.4  ...   │
│                                                    │
│                            Reset to defaults       │
└────────────────────────────────────────────────────┘
```

- **Per-provider tier selectors** — same Popover picker pattern, but filtered to only show models from this provider
- **"overridden" badge** — shown in the collapsed header when custom values exist
- **"Reset to defaults"** — clears all per-provider overrides
- **Default hint** — below each selector, shows built-in default model ID
- **Auto-save** on selection

### Tier Model Picker Component

A shared `TierModelPicker` component used by both global and per-provider tier selectors. Props:

```typescript
interface TierModelPickerProps {
  /** Currently selected model ID (or empty for default). */
  value: string;
  /** Provider filter — if set, only show models from this provider. Null = all providers. */
  providerFilter: string | null;
  /** Placeholder text when no value is set. */
  placeholder: string;
  /** Provider name to show below model name in the trigger. Null = derive from value. */
  providerLabel?: string;
  /** Available model groups (from models.list()). */
  modelGroups: AvailableModelGroup[];
  /** Called when user selects a model. */
  onSelect: (modelId: string) => void;
}
```

Internally:
- Renders a Popover trigger button + content
- Search input at top filters models
- Models grouped by provider (when `providerFilter` is null) or flat list (when filtered)
- Check mark on selected model
- "Custom model ID..." footer switches to text input mode
- Compact — max-height ~320px with scroll

### Nav Sidebar & Header

Rename:
- NavSidebar: "Defaults" → "Providers"
- Header SECTION_LABELS: "Model Defaults" → "Providers"

The `AdminSection` type value stays `modelDefaults` (no state migration needed).

### Add Provider

A `+ Add provider` button at the bottom of the list. Clicking reveals an inline input:

```
│  Provider ID: [_______________]  [Add]  [Cancel]  │
```

New provider appears expanded so the user can immediately configure it.

### Empty State

If no providers are configured:

```
No providers available yet. Add a provider API key in Settings
or authenticate with a provider to get started.
```

### Auto-Save Flow

1. User selects a model in any tier picker (global or per-provider)
2. All current tier settings are collected and saved via `providerDefaults.setGlobalDefaults()`
3. Brief "Saved" feedback inline, fades after 1.5s
4. On error, `text-destructive` inline message
5. State reloaded after save

### What's Removed

- Global "Save defaults" / "Reload" buttons
- "Effective: LOW x · MED y · HIGH z" summary line
- Raw text inputs for model IDs (replaced by Popover pickers)
- "Clear override" label (replaced with "Reset to defaults")
- Top-level "Add provider id..." input

### What's Unchanged

- IPC: `providerDefaults.get()`, `setGlobalDefaults()`
- Data model: `ProviderModelDefaults`, `ProviderDefaultsState`
- Component file stays at `ui/components/ModelDefaultsPanel.tsx`

## File Changes

| File | Action |
|------|--------|
| `ui/components/ModelDefaultsPanel.tsx` | Rewrite — global tiers + provider cards with health + auto-save |
| `ui/components/TierModelPicker.tsx` | **NEW** — Popover-based model picker (search, grouped models, custom ID) |
| `ui/components/ProviderCard.tsx` | **NEW** — Collapsible provider card with health badge + per-provider tier overrides |
| `ui/hooks/useSeroFiles.ts` | Add `models.list()` and `auth.getProviders()`/`auth.login()` to `SeroApi` |
| `ui/components/NavSidebar.tsx` | Change "Defaults" label to "Providers" |
| `ui/components/Header.tsx` | Change "Model Defaults" label to "Providers" |
