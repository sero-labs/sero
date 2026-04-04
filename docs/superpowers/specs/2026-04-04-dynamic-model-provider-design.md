# Dynamic Model Provider System

> Remove Claude as hardcoded default. Make model selection user-driven with a
> tier system (LOW/MED/HIGH) and resilient fallback resolution.

## Background

Anthropic is restricting third-party use of consumer Claude subscriptions. Sero
currently hardcodes Claude models as defaults across agent templates, bootstrap
settings, shared infrastructure, and fallback chains. This must change so that:

- No provider is privileged by default
- Users explicitly choose their preferred models during onboarding
- Agent templates work with any provider via tier aliases + fallback lists
- Anthropic remains an option (with a risk warning)

## Agent Frontmatter Format

### New structured model field

Replace the flat `"model": "claude-sonnet-4-6"` string with a structured object:

```json
{
  "model": {
    "prefer": "MED",
    "fallbacks": ["gpt-5.4", "claude-sonnet-4-6", "gemini-2.5-pro"]
  }
}
```

**Fields:**

- `prefer` — a tier alias (`LOW`, `MED`, `HIGH`) or a specific model ID.
  Resolved first.
- `fallbacks` — ordered list of specific model IDs to try if `prefer` cannot
  resolve to an available model.

**Backwards compatibility:** If `"model"` is a plain string, treat it as a
specific model ID (legacy behavior for user-edited templates).

### Resolution order

1. If `prefer` is a tier alias → look up user's chosen model for that tier
2. If `prefer` is a specific model ID → try that model directly
3. If resolved model is unavailable → iterate `fallbacks`, use first available
4. If nothing works → show inline model picker UI

### Tier mapping for existing templates

| Tier | Templates |
|------|-----------|
| LOW  | `scout.md` |
| MED  | `analyst.md`, `implementer.md`, `reviewer.md`, `researcher.md`, `test-writer.md`, `spec-reviewer.md`, `quality-reviewer.md`, `research-analyst.md`, `visionary.md`, `collab-analyst.md` |
| HIGH | `planner.md`, `coordinator.md` |

### Fallback model lists per tier

Each template includes a multi-provider fallback list appropriate for its tier:

- **LOW fallbacks:** `gpt-4.1-mini`, `claude-haiku-4-5`, `gemini-2.5-flash`
- **MED fallbacks:** `gpt-5.4`, `claude-sonnet-4-6`, `gemini-2.5-pro`
- **HIGH fallbacks:** `gpt-5.4`, `claude-sonnet-4-6`, `gemini-2.5-pro`

## Tier Settings Storage

### Per-profile `modelTiers` in settings.json

```json
{
  "modelTiers": {
    "LOW": { "provider": "google", "modelId": "gemini-2.5-flash" },
    "MED": { "provider": "openai", "modelId": "gpt-5.4" },
    "HIGH": { "provider": "openai", "modelId": "gpt-5.4" }
  }
}
```

- Stored per-profile inside `settings.json`
- Cloned alongside `auth.json` when creating a profile from an existing one
- If `modelTiers` is missing or empty, system auto-assigns from available
  models using a built-in capability ranking
- Existing `defaultModel`/`defaultProvider` fields remain functional but
  become secondary to the tier system. They serve as the fallback when
  `modelTiers` is absent (migration path).

### Profile cloning

When creating a profile with "copy credentials from existing profile":

- Clone `auth.json` (existing behavior)
- Clone `modelTiers` from source profile's `settings.json` (new)
- Update UI copy to say "credentials and model preferences"

## Onboarding Flow

Updated sequence (4 steps):

1. **Create profile** — existing ProfileSetup, clone message updated to mention
   model preferences
2. **Sign into provider(s)** — existing AuthLoginDialog, with new Anthropic
   warning banner
3. **Pick tier defaults** (NEW) — three model selects (LOW/MED/HIGH), populated
   from available models only. Features:
   - "Use same model for all tiers" toggle
   - Skip button → auto-assigns sensible defaults from available models
   - Only models from authenticated providers appear
4. **Memory setup** — existing agent-driven memory bootstrap

### Tier picker UI

- Three labeled sections: LOW ("Fast, cheap tasks"), MED ("Everyday agents"),
  HIGH ("Complex reasoning")
- Each has a dropdown/select of available models grouped by provider
- Toggle at top: "Use the same model for all tiers" — shows single select,
  populates all three
- "Skip" button at bottom — auto-assigns using built-in quality ranking
- "Continue" button — saves selections to `modelTiers` in settings.json

## Anthropic Warning

Inline warning banner in `AuthLoginDialog` when user selects Anthropic as their
provider, shown before auth proceeds:

> ⚠️ Anthropic may restrict third-party use of consumer subscriptions. We
> recommend using an API key with your own billing account.

- Appears inline in the provider list / auth form area
- Dismissible — user clicks through to continue auth
- Shown once per auth attempt (not persisted)
- Non-blocking — does not prevent auth from proceeding

## Model Resolver Changes

### `resolve.ts` — HARDCODED_DEFAULTS

Replace:
```ts
model: 'claude-sonnet-4-6'
```

With tier-aware resolution:
```ts
model: { prefer: 'MED', fallbacks: ['gpt-5.4', 'claude-sonnet-4-6', 'gemini-2.5-pro'] }
```

The `resolveConfig()` function must handle the new structured `model` field:

1. Parse `model` — if string, treat as specific model ID (legacy). If object,
   use `prefer` + `fallbacks`.
2. Resolve `prefer`:
   - If tier alias → read `modelTiers[tier]` from settings
   - If model ID → use directly
3. Check availability via model registry
4. If unavailable → iterate `fallbacks`
5. If all fail → return a sentinel indicating "needs user pick"

### `shared-infra.ts` — ensureInfra()

Remove:
```ts
_model = getModel('anthropic', 'claude-opus-4-6');
```

Replace with tier-aware initialization:
1. Read `modelTiers.HIGH` from settings
2. If set and available → use it
3. If not → walk fallback chain
4. If nothing available → defer model assignment (don't crash at boot)

The app must be able to start without any authenticated provider. Model
resolution happens lazily when a session is created, not eagerly at boot.

### `adhoc-agent.ts` — FAST_MODEL_PREFERENCES

Replace Claude-first ordering with tier-aware resolution:
1. Try user's `LOW` tier model
2. Fall back to provider-neutral list ordered by cost/speed

### `model-fallback-chain.ts` — default chain

Reorder to be provider-neutral:
```ts
[
  'gpt-5.4',
  'gpt-4.1-mini',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3-flash',
]
```

### `agent-model-context.ts` — pickFallbackModel()

Update to check tier settings before walking the fallback chain:
1. Try user's tier model (based on context — LOW for fast tasks, MED default)
2. Then existing fallback chain logic

## Inline Model Picker (Resolution Failure)

When no model can be resolved for an agent (tier not set, all fallbacks
unavailable):

- Show an inline UI prompt in the chat/agent area
- Message: "No available model for [agent name]. Pick one from your available
  models:"
- Dropdown of all available models grouped by provider
- Selection starts the agent immediately with the chosen model
- Optionally: "Set as default for [TIER] tier" checkbox

## Hardcoded Default Removal

All hardcoded Claude references must be replaced:

| File | Current | Replacement |
|------|---------|-------------|
| `electron/main.ts` bootstrap | `defaultProvider: 'anthropic'`, `defaultModel: 'claude-opus-4-6'` | Remove fixed provider/model; seed empty `modelTiers: {}` so the key exists. Populated during onboarding or auto-assigned on first session. |
| `electron/shared/infra/shared-infra.ts` | `getModel('anthropic', 'claude-opus-4-6')` | Tier-aware lazy resolution via HIGH tier |
| `electron/features/subagent/core/resolve.ts` | `HARDCODED_DEFAULTS.model = 'claude-sonnet-4-6'` | Structured model with `prefer: 'MED'` + multi-provider fallbacks |
| `electron/features/agent/assistants/adhoc-agent.ts` | Claude-first `FAST_MODEL_PREFERENCES` | LOW tier resolution + provider-neutral fallback |
| `electron/shared/settings/model-fallback-chain.ts` | Claude-first default chain | Provider-neutral ordering |
| `packages/templates/agents/*.md` (13 files) | `"model": "claude-sonnet-4-6"` or `"claude-haiku-4-5"` | Structured `{ prefer, fallbacks }` per tier mapping above |

## Non-Goals

- Removing Anthropic as a provider — it remains fully functional
- Changing the model selector UI in the main app (already provider-neutral)
- Migrating existing user settings automatically (graceful fallback handles
  this — old `defaultModel` still works)
- Per-workspace or per-session tier overrides (future enhancement)
