# Dynamic Model Provider System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Claude as the hardcoded default provider and introduce a LOW/MED/HIGH model tier system that lets users choose their preferred models per tier during onboarding, with resilient fallback resolution in agent templates.

**Architecture:** New `modelTiers` field in per-profile `settings.json` stores user-chosen models for LOW/MED/HIGH tiers. Agent templates use a structured `{ prefer, fallbacks }` model field instead of hardcoded model IDs. A new `resolveTierModel()` function resolves tier aliases to concrete models using the user's settings + fallback list. Onboarding gains a tier picker step between auth and memory setup.

**Tech Stack:** TypeScript, Electron IPC, React 19, Zustand, Tailwind 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-04-dynamic-model-provider-design.md`

---

### Task 1: Add model tier types and settings helpers

**Files:**
- Create: `apps/desktop/electron/shared/settings/model-tiers.ts`
- Modify: `apps/desktop/src/types/ipc.ts`

This task defines the shared types and settings read/write helpers for the tier system. Everything else depends on this.

- [ ] **Step 1: Define model tier types in ipc.ts**

Add to `apps/desktop/src/types/ipc.ts` near the other model-related types (around line 279):

```ts
/** Model tier levels for user-configured defaults. */
export type ModelTier = 'LOW' | 'MED' | 'HIGH';

/** A user-configured model for a specific tier. */
export interface ModelTierEntry {
  provider: string;
  modelId: string;
}

/** Per-profile tier configuration stored in settings.json. */
export type ModelTierSettings = Partial<Record<ModelTier, ModelTierEntry>>;
```

- [ ] **Step 2: Create model-tiers.ts settings helpers**

Create `apps/desktop/electron/shared/settings/model-tiers.ts`:

```ts
/**
 * Model tier settings — read/write helpers for LOW/MED/HIGH tier
 * configuration in settings.json.
 *
 * Tiers are stored under `sero.modelTiers` in the global settings object.
 */

import type { ModelTier, ModelTierEntry, ModelTierSettings } from '../../../src/types/ipc';

export const MODEL_TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;

function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Read the model tier settings from a settings object. */
export function getModelTiers(settings: Record<string, unknown>): ModelTierSettings {
  const sero = getSeroSettings(settings);
  const raw = sero.modelTiers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: ModelTierSettings = {};
  for (const tier of MODEL_TIERS) {
    const entry = (raw as Record<string, unknown>)[tier];
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).provider === 'string' &&
      typeof (entry as Record<string, unknown>).modelId === 'string'
    ) {
      result[tier] = entry as ModelTierEntry;
    }
  }
  return result;
}

/** Write model tier settings into a settings object (returns new object). */
export function setModelTiers(
  settings: Record<string, unknown>,
  tiers: ModelTierSettings,
): Record<string, unknown> {
  const sero = getSeroSettings(settings);
  return {
    ...settings,
    sero: {
      ...sero,
      modelTiers: tiers,
    },
  };
}

/** Check if any tier is configured. */
export function hasModelTiers(settings: Record<string, unknown>): boolean {
  const tiers = getModelTiers(settings);
  return Object.keys(tiers).length > 0;
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/shared/settings/model-tiers.ts apps/desktop/src/types/ipc.ts
git commit -m "feat: add model tier types and settings helpers (LOW/MED/HIGH)"
```

---

### Task 2: Create tier-aware model resolver

**Files:**
- Create: `apps/desktop/electron/shared/settings/resolve-tier-model.ts`

This is the core resolution function that takes a structured model field and resolves it to a concrete available model using tier settings + fallbacks.

- [ ] **Step 1: Create resolve-tier-model.ts**

Create `apps/desktop/electron/shared/settings/resolve-tier-model.ts`:

```ts
/**
 * Tier-aware model resolution.
 *
 * Resolves a structured model field (with `prefer` tier alias + `fallbacks`)
 * to a concrete available model. Used by the subagent resolver and adhoc agent.
 *
 * Resolution order:
 *   1. If `prefer` is a tier alias (LOW/MED/HIGH) → user's chosen model for that tier
 *   2. If `prefer` is a model ID → try that model directly
 *   3. Iterate `fallbacks` → use first available
 *   4. Return null → caller should prompt user to pick
 */

import type { ModelTier, ModelTierSettings } from '../../../src/types/ipc';
import { MODEL_TIERS } from './model-tiers';

/** The structured model field from agent frontmatter. */
export interface StructuredModelField {
  prefer: string;
  fallbacks: string[];
}

/** A model available in the registry (provider + id). */
export interface AvailableModel {
  provider: string;
  id: string;
}

/** Result of model resolution. */
export interface ResolvedModel {
  provider: string;
  modelId: string;
}

function isTierAlias(value: string): value is ModelTier {
  return MODEL_TIERS.includes(value as ModelTier);
}

function findModelById(
  available: AvailableModel[],
  modelId: string,
): AvailableModel | undefined {
  const lowerId = modelId.toLowerCase();
  return available.find((m) => m.id.toLowerCase() === lowerId);
}

/**
 * Parse a model field from agent frontmatter.
 *
 * Accepts either:
 * - A plain string (legacy): `"claude-sonnet-4-6"` → { prefer: "claude-sonnet-4-6", fallbacks: [] }
 * - A structured object: `{ prefer: "MED", fallbacks: ["gpt-5.4", ...] }`
 */
export function parseModelField(
  raw: unknown,
): StructuredModelField | null {
  if (typeof raw === 'string' && raw.trim()) {
    return { prefer: raw.trim(), fallbacks: [] };
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const prefer = typeof obj.prefer === 'string' ? obj.prefer.trim() : '';
    if (!prefer) return null;

    const fallbacks: string[] = [];
    if (Array.isArray(obj.fallbacks)) {
      for (const f of obj.fallbacks) {
        if (typeof f === 'string' && f.trim()) fallbacks.push(f.trim());
      }
    }
    return { prefer, fallbacks };
  }

  return null;
}

/**
 * Resolve a structured model field to a concrete available model.
 *
 * Returns null if no model could be resolved (caller should prompt user).
 */
export function resolveTierModel(
  field: StructuredModelField,
  tierSettings: ModelTierSettings,
  available: AvailableModel[],
): ResolvedModel | null {
  if (available.length === 0) return null;

  // 1. Resolve `prefer`
  if (isTierAlias(field.prefer)) {
    const tierEntry = tierSettings[field.prefer];
    if (tierEntry) {
      const match = available.find(
        (m) => m.provider === tierEntry.provider && m.id === tierEntry.modelId,
      );
      if (match) return { provider: match.provider, modelId: match.id };
    }
  } else {
    // Treat as a model ID
    const match = findModelById(available, field.prefer);
    if (match) return { provider: match.provider, modelId: match.id };
  }

  // 2. Walk fallbacks
  for (const fallback of field.fallbacks) {
    const match = findModelById(available, fallback);
    if (match) return { provider: match.provider, modelId: match.id };
  }

  return null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/shared/settings/resolve-tier-model.ts
git commit -m "feat: add tier-aware model resolver (parseModelField + resolveTierModel)"
```

---

### Task 3: Update agent frontmatter parsing for structured model field

**Files:**
- Modify: `apps/desktop/electron/features/subagent/core/types.ts:32-53`
- Modify: `apps/desktop/electron/features/subagent/runtime/discovery.ts:92-109`

The `AgentConfig.model` field changes from `string | undefined` to support both legacy strings and structured objects.

- [ ] **Step 1: Update AgentConfig type**

In `apps/desktop/electron/features/subagent/core/types.ts`, change the `model` field on `AgentConfig` (line 38):

Replace:
```ts
  /** Default model for this agent. */
  model?: string;
```

With:
```ts
  /** Default model — plain string (legacy) or structured { prefer, fallbacks }. */
  model?: string | { prefer: string; fallbacks: string[] };
```

- [ ] **Step 2: Update toAgentConfig() in discovery.ts**

In `apps/desktop/electron/features/subagent/runtime/discovery.ts`, update `toAgentConfig()` at line 100.

First add the import at the top:
```ts
import { parseModelField } from '../../../shared/settings/resolve-tier-model';
```

Replace:
```ts
    model: typeof fm.model === 'string' ? fm.model : undefined,
```

With:
```ts
    model: parseAgentModelField(fm.model),
```

Add the helper function above `toAgentConfig()`:

```ts
/**
 * Parse model field from frontmatter into the AgentConfig union type.
 * Returns plain string for legacy format, structured object for new format.
 */
function parseAgentModelField(
  raw: unknown,
): string | { prefer: string; fallbacks: string[] } | undefined {
  if (typeof raw === 'string' && raw.trim()) return raw;
  const parsed = parseModelField(raw);
  return parsed ?? undefined;
}
```

- [ ] **Step 3: Update model validation warning in discovery.ts**

In `discovery.ts` around lines 158-164, update the model validation to handle structured fields:

Replace:
```ts
      // Warn about unknown models (non-blocking)
      const model = parsed.frontmatter.model;
      if (typeof model === 'string' && options?.isValidModel && !options.isValidModel(model)) {
        console.warn(
          `[subagent/discovery] ${absPath}: model '${model}' not found in registry`,
        );
      }
```

With:
```ts
      // Warn about unknown models (non-blocking) — skip tier aliases
      const model = parsed.frontmatter.model;
      if (typeof model === 'string' && options?.isValidModel && !options.isValidModel(model)) {
        console.warn(
          `[subagent/discovery] ${absPath}: model '${model}' not found in registry`,
        );
      }
      // Structured model fields are validated at resolution time, not discovery
```

- [ ] **Step 4: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: May see type errors in files that consume `AgentConfig.model` as `string`. Fix them in the next task.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/features/subagent/core/types.ts apps/desktop/electron/features/subagent/runtime/discovery.ts
git commit -m "feat: support structured model field in agent frontmatter parsing"
```

---

### Task 4: Update resolve.ts to handle structured model fields

**Files:**
- Modify: `apps/desktop/electron/features/subagent/core/resolve.ts`

The resolver must handle `AgentConfig.model` being either a string or a structured object. It still outputs a flat `model: string` in `ResolvedConfig` — the tier resolution happens in the runner (Task 5).

- [ ] **Step 1: Update resolveConfig to handle structured model**

Replace the full contents of `apps/desktop/electron/features/subagent/core/resolve.ts`:

```ts
/**
 * Config resolution — 5-level precedence chain for model, thinking, and timeout.
 *
 * Precedence (highest → lowest):
 *   1. Per-task override (tasks[i] / chain[i])
 *   2. Top-level call override
 *   3. Agent frontmatter
 *   4. Global subagent settings (settings.json)
 *   5. Session / app defaults
 *
 * The `model` field from agent frontmatter may be a plain string (legacy)
 * or a structured `{ prefer, fallbacks }` object. When structured, the
 * `prefer` value is emitted as the model string — tier resolution happens
 * downstream in the runner where the model registry is available.
 */

import type {
  AgentConfig,
  SubagentSettings,
  ResolvedConfig,
  TaskOverride,
} from './types';

/**
 * Provider-neutral defaults used as the absolute fallback.
 * Uses MED tier alias — resolved to a concrete model at runtime.
 */
const HARDCODED_DEFAULTS = {
  model: 'MED',
  thinking: 'high',
  timeoutMs: 600_000,
  toolStallTimeoutMs: 120_000,
} as const;

export interface SessionDefaults {
  model?: string;
  thinking?: string;
}

/**
 * Extract the primary model string from an AgentConfig.model value.
 * Structured fields emit the `prefer` value; plain strings pass through.
 */
function extractModelString(
  model: string | { prefer: string; fallbacks: string[] } | undefined,
): string | undefined {
  if (typeof model === 'string') return model || undefined;
  if (model && typeof model === 'object') return model.prefer || undefined;
  return undefined;
}

/**
 * Resolve the concrete model, thinking, and timeoutMs for a subagent run.
 *
 * Each level only overrides if the value is non-null/non-undefined.
 * Falls back to hardcoded defaults as the last resort.
 *
 * NOTE: The returned `model` may be a tier alias (e.g. "MED") when it
 * originates from agent frontmatter or hardcoded defaults. The runner
 * is responsible for resolving tier aliases to concrete model IDs.
 */
export function resolveConfig(
  taskOverride?: TaskOverride,
  callOverride?: TaskOverride,
  agentConfig?: Pick<AgentConfig, 'model' | 'thinking' | 'timeoutMs'>,
  settings?: Pick<SubagentSettings, 'model' | 'thinking' | 'timeoutMs' | 'toolStallTimeoutMs'>,
  sessionDefaults?: SessionDefaults,
): ResolvedConfig {
  const model = firstDefined(
    taskOverride?.model,
    callOverride?.model,
    extractModelString(agentConfig?.model),
    settings?.model,
    sessionDefaults?.model,
    HARDCODED_DEFAULTS.model,
  );

  const thinking = firstDefined(
    taskOverride?.thinking,
    callOverride?.thinking,
    agentConfig?.thinking,
    settings?.thinking,
    sessionDefaults?.thinking,
    HARDCODED_DEFAULTS.thinking,
  );

  const timeoutMs = firstDefinedNumber(
    taskOverride?.timeoutMs,
    callOverride?.timeoutMs,
    agentConfig?.timeoutMs,
    settings?.timeoutMs,
    HARDCODED_DEFAULTS.timeoutMs,
  );

  const toolStallTimeoutMs = settings?.toolStallTimeoutMs ?? HARDCODED_DEFAULTS.toolStallTimeoutMs;

  return { model, thinking, timeoutMs, toolStallTimeoutMs };
}

/**
 * Return the first non-null, non-undefined string value.
 */
function firstDefined(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return '';
}

/**
 * Return the first non-null, non-undefined number value.
 */
function firstDefinedNumber(...values: (number | null | undefined)[]): number {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return HARDCODED_DEFAULTS.timeoutMs;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS — the output shape (`ResolvedConfig`) hasn't changed, just the input handling.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/features/subagent/core/resolve.ts
git commit -m "feat: update resolveConfig to handle structured model fields and tier aliases"
```

---

### Task 5: Update subagent runner to resolve tier aliases

**Files:**
- Modify: `apps/desktop/electron/features/subagent/runtime/runner.ts:203-213`

The runner currently does `available.find((m) => m.id === resolved.model)`. It needs to handle tier aliases by using `resolveTierModel()`.

- [ ] **Step 1: Add tier resolution to runner model lookup**

In `apps/desktop/electron/features/subagent/runtime/runner.ts`, at the model resolution block around lines 203-213.

First add imports at the top of the file:

```ts
import { parseModelField, resolveTierModel } from '../../../shared/settings/resolve-tier-model';
import { getModelTiers, MODEL_TIERS } from '../../../shared/settings/model-tiers';
```

Then replace the model resolution block (lines 203-213):

```ts
      const match = available.find((m) => m.id === resolved.model);
      if (match) {
        const model = infra.modelRegistry.find(match.provider, match.id);
        if (model) await session.setModel(model);
      }
```

With:

```ts
      const globalSettings = infra.settingsManager.getGlobalSettings() as Record<string, unknown>;
      const tierSettings = getModelTiers(globalSettings);

      // Check if the resolved model string is a tier alias or has a structured source
      const agentModelField = agent.model;
      const parsed = parseModelField(agentModelField);
      let resolvedModel: { provider: string; modelId: string } | null = null;

      if (parsed) {
        // Use the full structured field for resolution (tier + fallbacks)
        resolvedModel = resolveTierModel(parsed, tierSettings, available);
      }

      if (!resolvedModel) {
        // Legacy: try the flat resolved.model string directly
        const match = available.find((m) => m.id === resolved.model);
        if (match) resolvedModel = { provider: match.provider, modelId: match.id };
      }

      if (resolvedModel) {
        const model = infra.modelRegistry.find(resolvedModel.provider, resolvedModel.modelId);
        if (model) await session.setModel(model);
      }
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/features/subagent/runtime/runner.ts
git commit -m "feat: resolve tier aliases and structured model fields in subagent runner"
```

---

### Task 6: Update model fallback chain to be provider-neutral

**Files:**
- Modify: `apps/desktop/electron/shared/settings/model-fallback-chain.ts:8-16`

Reorder the default fallback chain so it doesn't lead with Claude models.

- [ ] **Step 1: Reorder DEFAULT_FALLBACK_CHAIN**

In `apps/desktop/electron/shared/settings/model-fallback-chain.ts`, replace lines 8-16:

```ts
const DEFAULT_FALLBACK_CHAIN = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'gpt-5.4',
  'gpt-5',
  'gemini-3-flash-preview',
  'gemini-3-flash',
  'gemini-2.5-flash',
] as const;
```

With:

```ts
const DEFAULT_FALLBACK_CHAIN = [
  'gpt-5.4',
  'gpt-4.1-mini',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3-flash',
] as const;
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/shared/settings/model-fallback-chain.ts
git commit -m "feat: reorder model fallback chain to be provider-neutral"
```

---

### Task 7: Remove hardcoded Claude defaults from bootstrap and shared-infra

**Files:**
- Modify: `apps/desktop/electron/main.ts:61-79`
- Modify: `apps/desktop/electron/shared/infra/shared-infra.ts:141-155`

The bootstrap seeds empty `modelTiers` instead of a fixed provider/model. The shared-infra lazy-init uses the fallback chain instead of a hardcoded model.

- [ ] **Step 1: Update bootstrapAgentDir() in main.ts**

In `apps/desktop/electron/main.ts`, replace the `defaults` object in `bootstrapAgentDir()` (lines 67-74):

```ts
    const defaults = {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-opus-4-6',
      defaultThinkingLevel: 'high',
      packages: workspacePackages,
      sero: {
        modelFallbackChain: getDefaultModelFallbackChain(),
      },
    };
```

With:

```ts
    const defaults = {
      defaultThinkingLevel: 'high',
      packages: workspacePackages,
      sero: {
        modelFallbackChain: getDefaultModelFallbackChain(),
        modelTiers: {},
      },
    };
```

- [ ] **Step 2: Update ensureInfra() in shared-infra.ts**

In `apps/desktop/electron/shared/infra/shared-infra.ts`, replace the hardcoded model init (lines 153-154):

```ts
    _model = getModel('anthropic', 'claude-opus-4-6');
    if (!_model) throw new Error('Model claude-opus-4-6 not found in registry');
```

With:

```ts
    // Pick a model from the fallback chain — no hardcoded provider dependency.
    // The app must be able to start without any specific provider authenticated.
    _model = pickFirstAvailableModel(_modelRegistry, _settingsManager!);
```

Add the helper function above `ensureInfra()`:

```ts
import { getConfiguredModelFallbackChain } from '../settings/model-fallback-chain';
import { getModelTiers } from '../settings/model-tiers';

/**
 * Pick the first available model using tier settings, then fallback chain.
 * Returns null if no model is available (no auth configured yet).
 */
function pickFirstAvailableModel(
  registry: ModelRegistry,
  settingsManager: ReturnType<typeof SettingsManager.create>,
): Model<Api> | null {
  const available = registry.getAvailable();
  if (available.length === 0) return null;

  const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;

  // Try HIGH tier model first (most capable, used for main sessions)
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const match = available.find(
      (m) => m.provider === tiers.HIGH!.provider && m.id === tiers.HIGH!.modelId,
    );
    if (match) return match;
  }

  // Try fallback chain
  const chain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of chain) {
    const match = available.find((m) => m.id === candidate);
    if (match) return match;
  }

  // Last resort: first available model
  return available[0] ?? null;
}
```

Also update the null check after the model assignment. Replace:

```ts
  if (!_authStorage) {
    _authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
    _modelRegistry = new ModelRegistry(_authStorage, `${SERO_AGENT_DIR}/models.json`);
    _settingsManager = SettingsManager.create(
      SERO_AGENT_DIR,
      SERO_AGENT_DIR,
    );
    // Default to 'high' thinking if the user hasn't explicitly set a level
    if (!_settingsManager.getDefaultThinkingLevel()) {
      _settingsManager.setDefaultThinkingLevel('high');
    }
    _model = getModel('anthropic', 'claude-opus-4-6');
    if (!_model) throw new Error('Model claude-opus-4-6 not found in registry');
  }

  const infra = {
    authStorage: _authStorage,
    modelRegistry: _modelRegistry!,
    settingsManager: _settingsManager!,
    model: _model!,
  };
```

With:

```ts
  if (!_authStorage) {
    _authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
    _modelRegistry = new ModelRegistry(_authStorage, `${SERO_AGENT_DIR}/models.json`);
    _settingsManager = SettingsManager.create(
      SERO_AGENT_DIR,
      SERO_AGENT_DIR,
    );
    // Default to 'high' thinking if the user hasn't explicitly set a level
    if (!_settingsManager.getDefaultThinkingLevel()) {
      _settingsManager.setDefaultThinkingLevel('high');
    }
    _model = pickFirstAvailableModel(_modelRegistry, _settingsManager);
  }

  // Model may be null if no provider is authenticated yet — that's OK.
  // Sessions resolve their own model at prompt time. The shared model is
  // only used by adhoc agents as a fallback.
  const infra = {
    authStorage: _authStorage,
    modelRegistry: _modelRegistry!,
    settingsManager: _settingsManager!,
    model: _model!,
  };
```

- [ ] **Step 3: Update SharedInfra type to allow null model**

In `shared-infra.ts`, update the `SharedInfra` interface (line 122):

```ts
export interface SharedInfra {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: ReturnType<typeof SettingsManager.create>;
  model: Model<Api> | null;
}
```

And update the infra object construction:

```ts
  const infra = {
    authStorage: _authStorage,
    modelRegistry: _modelRegistry!,
    settingsManager: _settingsManager!,
    model: _model,
  };
```

- [ ] **Step 4: Fix downstream null model references**

The `model` field is now nullable. Check callers of `ensureInfra()` that access `.model` — notably `adhoc-agent.ts` at line 36 uses `infra.model` as a fallback. This will be updated in Task 8.

Run: `cd <repo-root> && pnpm typecheck`
Expected: Type errors in files consuming `SharedInfra.model` (adhoc-agent.ts, possibly runner.ts). Note them — they'll be fixed in subsequent tasks.

- [ ] **Step 5: Remove unused getModel import if no longer needed**

In `shared-infra.ts` line 21, check if `getModel` is still used elsewhere in the file. If not, remove it from the import:

```ts
import { type Model, type Api } from '@mariozechner/pi-ai';
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/main.ts apps/desktop/electron/shared/infra/shared-infra.ts
git commit -m "feat: remove hardcoded Claude defaults from bootstrap and shared-infra"
```

---

### Task 8: Update adhoc-agent to use tier-aware model selection

**Files:**
- Modify: `apps/desktop/electron/features/agent/assistants/adhoc-agent.ts`

Replace the Claude-first `FAST_MODEL_PREFERENCES` with tier-aware resolution using the LOW tier.

- [ ] **Step 1: Rewrite adhoc-agent.ts model selection**

Replace the full contents of `apps/desktop/electron/features/agent/assistants/adhoc-agent.ts`:

```ts
import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { Api, Model } from '@mariozechner/pi-ai';

import { SERO_AGENT_DIR } from '../../../platform/env';
import { ensureInfra } from '../../../shared/infra/shared-infra';
import { getModelTiers } from '../../../shared/settings/model-tiers';

/** Provider-neutral fast model preferences, ordered by speed/cost. */
const FAST_MODEL_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: 'openai', modelId: 'gpt-4.1-mini' },
  { provider: 'openai', modelId: 'gpt-4o-mini' },
  { provider: 'google', modelId: 'gemini-2.5-flash' },
  { provider: 'google', modelId: 'gemini-2.0-flash' },
  { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
  { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest' },
];

interface SelectedModel {
  model: Model<Api>;
  provider: string;
  modelId: string;
}

export interface AdhocAgentResult {
  text: string;
  model: string;
}

const ADHOC_TIMEOUT_MS = 30_000;

export async function runAdhocAgent(
  workspacePath: string,
  prompt: string,
  thinkingLevel: ThinkingLevel = 'low',
): Promise<AdhocAgentResult> {
  const infra = await ensureInfra();
  const available = infra.modelRegistry.getAvailable();
  const selectedModel = selectFastModel(
    available,
    infra.settingsManager,
    infra.model,
  );

  const { session } = await createAgentSession({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    model: selectedModel.model,
    thinkingLevel,
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    tools: [],
    sessionManager: SessionManager.inMemory(workspacePath),
    settingsManager: infra.settingsManager,
  });

  let text = '';
  const unsub = session.subscribe((event) => {
    if (event.type !== 'message_update') return;
    const ame = event.assistantMessageEvent;
    if (ame.type === 'text_delta') text += ame.delta;
  });

  try {
    await Promise.race([
      session.prompt(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Adhoc agent timed out')), ADHOC_TIMEOUT_MS),
      ),
    ]);
  } finally {
    unsub();
    session.dispose();
  }

  return {
    text: text.trim(),
    model: `${selectedModel.provider}/${selectedModel.modelId}`,
  };
}

function selectFastModel(
  available: Model<Api>[],
  settingsManager: ReturnType<typeof import('@mariozechner/pi-coding-agent').SettingsManager.create>,
  fallback: Model<Api> | null,
): SelectedModel {
  // 1. Try user's LOW tier model
  const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
  const tiers = getModelTiers(globalSettings);
  if (tiers.LOW) {
    const match = available.find(
      (m) => m.provider === tiers.LOW!.provider && m.id === tiers.LOW!.modelId,
    );
    if (match) {
      return { model: match, provider: match.provider, modelId: match.id };
    }
  }

  // 2. Walk provider-neutral preference list
  for (const pref of FAST_MODEL_PREFERENCES) {
    const model = available.find((m) => m.provider === pref.provider && m.id === pref.modelId);
    if (model) {
      return { model, provider: pref.provider, modelId: pref.modelId };
    }
  }

  // 3. First available model
  if (available[0]) {
    return {
      model: available[0],
      provider: available[0].provider,
      modelId: available[0].id,
    };
  }

  // 4. Absolute fallback (shared infra model, may be null)
  if (fallback) {
    return {
      model: fallback,
      provider: fallback.provider,
      modelId: fallback.id,
    };
  }

  throw new Error('No models available — please authenticate with a model provider.');
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/features/agent/assistants/adhoc-agent.ts
git commit -m "feat: use LOW tier and provider-neutral ordering in adhoc agent"
```

---

### Task 9: Update pickFallbackModel to check tier settings

**Files:**
- Modify: `apps/desktop/electron/ipc/agent/core/agent-model-context.ts:75-97`

The fallback picker for main sessions should check tier settings before walking the chain.

- [ ] **Step 1: Update pickFallbackModel()**

In `apps/desktop/electron/ipc/agent/core/agent-model-context.ts`, add import at the top:

```ts
import { getModelTiers } from '../../../shared/settings/model-tiers';
```

Then replace the `pickFallbackModel` function (lines 75-97):

```ts
function pickFallbackModel(
  session: AgentSession,
  availableModels: ReturnType<AgentSession['modelRegistry']['getAvailable']>,
) {
  session.settingsManager.reload();

  // 1. Try saved default provider/model (existing settings)
  const preferredProvider = session.settingsManager.getDefaultProvider();
  const savedDefaultModel = findAvailableModelByProviderAndId(
    availableModels,
    preferredProvider,
    session.settingsManager.getDefaultModel(),
  );
  if (savedDefaultModel) return savedDefaultModel;

  // 2. Try HIGH tier model (main sessions use the most capable model)
  const globalSettings = session.settingsManager.getGlobalSettings() as Record<string, unknown>;
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const tierMatch = availableModels.find(
      (m) => m.provider === tiers.HIGH!.provider && m.id === tiers.HIGH!.modelId,
    );
    if (tierMatch) return tierMatch;
  }

  // 3. Walk fallback chain
  const fallbackChain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of fallbackChain) {
    const model = findAvailableModelByReference(availableModels, candidate, preferredProvider);
    if (model) return model;
  }

  return availableModels[0];
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/ipc/agent/core/agent-model-context.ts
git commit -m "feat: check HIGH tier model in pickFallbackModel before walking chain"
```

---

### Task 10: Add model tier IPC handlers

**Files:**
- Modify: `apps/desktop/src/types/ipc-channels.ts`
- Modify: `apps/desktop/src/types/electron.d.ts`
- Modify: `apps/desktop/electron/ipc/workspace/profiles.ts`

Add IPC channels for reading/writing model tier settings, and update the profile clone to copy tiers alongside auth.

- [ ] **Step 1: Add IPC channels for model tiers**

In `apps/desktop/src/types/ipc-channels.ts`, add a `modelTiers` section near the `models` channels (around line 137):

```ts
  modelTiers: {
    get: 'sero:model-tiers:get',
    set: 'sero:model-tiers:set',
  },
```

- [ ] **Step 2: Add model tier methods to electron.d.ts**

In `apps/desktop/src/types/electron.d.ts`, add to the `SeroAPI` interface a new `modelTiers` section:

```ts
  modelTiers: {
    get(): Promise<import('./ipc').ModelTierSettings>;
    set(tiers: import('./ipc').ModelTierSettings): Promise<void>;
  };
```

Note: This is one of the rare cases where inline `import()` is acceptable in `.d.ts` declaration files for the window API type, matching the existing pattern in that file. If the codebase uses a different pattern (top-level import type), follow that instead.

- [ ] **Step 3: Register model tier IPC handlers**

In `apps/desktop/electron/ipc/workspace/profiles.ts`, add handlers. First add imports:

```ts
import { readFileSync, writeFileSync } from 'fs';
import { SERO_AGENT_DIR } from '../../platform/env';
import { getModelTiers, setModelTiers } from '../../shared/settings/model-tiers';
import type { ModelTierSettings } from '../../../src/types/ipc';
```

Then add handlers inside `registerProfileHandlers()`:

```ts
  /** Get current model tier settings. */
  ipcMain.handle(IpcChannels.modelTiers.get, (): ModelTierSettings => {
    const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      return getModelTiers(settings);
    } catch {
      return {};
    }
  });

  /** Set model tier settings. */
  ipcMain.handle(
    IpcChannels.modelTiers.set,
    (_e, tiers: ModelTierSettings): void => {
      const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      } catch { /* fresh settings */ }
      const updated = setModelTiers(settings, tiers);
      writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + '\n');
    },
  );
```

- [ ] **Step 4: Update profile clone to copy model tiers**

In `apps/desktop/electron/ipc/workspace/profiles.ts`, in the `create` handler (around line 43), after the auth.json copy block, add tier cloning:

```ts
      // Copy modelTiers from source profile's settings.json
      if (copyAuthFromId) {
        const source = profileManager.findById(copyAuthFromId);
        if (source) {
          // ... existing auth.json copy ...

          // Copy model tier settings
          const srcSettings = path.join(source.path, 'agent', 'settings.json');
          if (existsSync(srcSettings)) {
            try {
              const srcSettingsObj = JSON.parse(readFileSync(srcSettings, 'utf8'));
              const srcTiers = getModelTiers(srcSettingsObj);
              if (Object.keys(srcTiers).length > 0) {
                const destSettingsPath = path.join(entry.path, 'agent', 'settings.json');
                let destSettings: Record<string, unknown> = {};
                try {
                  destSettings = JSON.parse(readFileSync(destSettingsPath, 'utf8'));
                } catch { /* fresh settings */ }
                const updated = setModelTiers(destSettings, srcTiers);
                writeFileSync(destSettingsPath, JSON.stringify(updated, null, 2) + '\n');
              }
            } catch {
              // Non-critical — tiers can be configured later
            }
          }
        }
      }
```

- [ ] **Step 5: Update preload to expose model tier IPC**

Find the preload file (likely `apps/desktop/electron/preload.ts` or similar) and add the `modelTiers` bridge methods to match the `electron.d.ts` declaration. This should follow the existing pattern for other IPC methods:

```ts
modelTiers: {
  get: () => ipcRenderer.invoke(IpcChannels.modelTiers.get),
  set: (tiers: ModelTierSettings) => ipcRenderer.invoke(IpcChannels.modelTiers.set, tiers),
},
```

- [ ] **Step 6: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/types/ipc-channels.ts apps/desktop/src/types/electron.d.ts \
       apps/desktop/electron/ipc/workspace/profiles.ts apps/desktop/electron/preload.ts
git commit -m "feat: add model tier IPC handlers and profile clone support"
```

---

### Task 11: Add Anthropic warning banner to AuthLoginViews

**Files:**
- Modify: `apps/desktop/src/components/layout/AuthLoginViews.tsx`

Show an inline warning when the user clicks to authenticate with Anthropic.

- [ ] **Step 1: Add warning banner to ProviderListView**

In `apps/desktop/src/components/layout/AuthLoginViews.tsx`, add a state and warning banner inside `ProviderListView`. Add `useState` and `TriangleAlert` to imports (TriangleAlert is from lucide-react).

Inside `ProviderListView`, add state:

```ts
const [anthropicWarning, setAnthropicWarning] = useState<string | null>(null);
```

Wrap the `onOAuthLogin` calls for Anthropic. Replace the OAuth button's `onClick`:

```ts
onClick={() => {
  if (p.id === 'anthropic' && !anthropicWarning) {
    setAnthropicWarning(p.id);
    return;
  }
  onOAuthLogin(p.id);
}}
```

After the OAuth providers loop (after the `</div>` closing `space-y-0.5`), add:

```tsx
{anthropicWarning && (
  <div className="mx-1 flex items-start gap-2 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--status-warning)]" />
    <div className="space-y-1.5">
      <p>
        Anthropic may restrict third-party use of consumer subscriptions.
        We recommend using an API key with your own billing account.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => {
            setAnthropicWarning(null);
            onOAuthLogin('anthropic');
          }}
          className="text-xs font-medium text-[var(--text-primary)] hover:underline"
        >
          Continue anyway
        </button>
        <button
          onClick={() => setAnthropicWarning(null)}
          className="text-xs text-[var(--text-tertiary)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

Apply the same pattern for the API key section — when `p.id === 'anthropic'`, show the warning before proceeding to `onApiKeyStart`.

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/layout/AuthLoginViews.tsx
git commit -m "feat: add Anthropic consumer subscription warning in auth dialog"
```

---

### Task 12: Create the TierPicker onboarding component

**Files:**
- Create: `apps/desktop/src/components/profiles/TierPicker.tsx`

A self-contained component for the onboarding step where users pick models for LOW/MED/HIGH tiers.

- [ ] **Step 1: Create TierPicker.tsx**

Create `apps/desktop/src/components/profiles/TierPicker.tsx`:

```tsx
/**
 * TierPicker — onboarding step for picking default models per tier.
 *
 * Shows three dropdowns (LOW/MED/HIGH) populated with available models.
 * Includes a "use same for all" toggle and a skip button.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui/components/ui/select';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { Label } from '@sero-ai/ui/components/ui/label';
import type { ModelTierSettings, ModelTierEntry } from '@/types/ipc';

interface AvailableModel {
  provider: string;
  modelId: string;
  name: string;
  providerName: string;
}

interface TierPickerProps {
  onComplete: (tiers: ModelTierSettings) => void;
  onSkip: () => void;
}

const TIER_META = [
  { key: 'LOW' as const, label: 'Low', desc: 'Fast, cheap tasks — scouts, quick lookups' },
  { key: 'MED' as const, label: 'Medium', desc: 'Everyday agents — analysis, implementation, review' },
  { key: 'HIGH' as const, label: 'High', desc: 'Complex reasoning — planning, coordination' },
] as const;

function modelKey(m: { provider: string; modelId: string }): string {
  return `${m.provider}/${m.modelId}`;
}

function parseModelKey(key: string): ModelTierEntry | null {
  const idx = key.indexOf('/');
  if (idx === -1) return null;
  return { provider: key.slice(0, idx), modelId: key.slice(idx + 1) };
}

export function TierPicker({ onComplete, onSkip }: TierPickerProps) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [sameForAll, setSameForAll] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Load available models
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await window.sero.models.list();
        if (cancelled) return;
        const flat: AvailableModel[] = [];
        for (const group of state) {
          for (const m of group.models) {
            flat.push({
              provider: m.provider,
              modelId: m.modelId,
              name: m.name,
              providerName: group.displayName,
            });
          }
        }
        setModels(flat);
      } catch {
        // No models available
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = useCallback((tier: string, value: string) => {
    setSelections((prev) => {
      if (sameForAll) {
        return { LOW: value, MED: value, HIGH: value };
      }
      return { ...prev, [tier]: value };
    });
  }, [sameForAll]);

  const handleSameToggle = useCallback((checked: boolean) => {
    setSameForAll(checked);
    if (checked) {
      // Use first available selection or empty
      const first = selections.LOW || selections.MED || selections.HIGH || '';
      setSelections({ LOW: first, MED: first, HIGH: first });
    }
  }, [selections]);

  const handleComplete = useCallback(() => {
    const tiers: ModelTierSettings = {};
    for (const { key } of TIER_META) {
      const val = selections[key];
      if (val) {
        const parsed = parseModelKey(val);
        if (parsed) tiers[key] = parsed;
      }
    }
    onComplete(tiers);
  }, [selections, onComplete]);

  const hasAnySelection = Object.values(selections).some(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading available models…
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="space-y-3 text-center py-4">
        <p className="text-sm text-muted-foreground">
          No models available. Sign in to a provider first.
        </p>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="same-for-all"
            checked={sameForAll}
            onCheckedChange={handleSameToggle}
          />
          <Label htmlFor="same-for-all" className="text-xs text-muted-foreground">
            Use the same model for all tiers
          </Label>
        </div>
      </div>

      <div className="space-y-3">
        {(sameForAll ? [TIER_META[0]] : TIER_META).map(({ key, label, desc }) => (
          <div key={key} className="space-y-1">
            <Label className="text-sm font-medium">
              {sameForAll ? 'All tiers' : label}
            </Label>
            <p className="text-xs text-muted-foreground">
              {sameForAll ? 'Single model for all task types' : desc}
            </p>
            <Select
              value={selections[key] || ''}
              onValueChange={(v) => handleSelect(key, v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a model…" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={modelKey(m)} value={modelKey(m)}>
                    <span className="text-xs text-muted-foreground mr-1.5">
                      {m.providerName}
                    </span>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" onClick={handleComplete} disabled={!hasAnySelection}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS (or minor issues with the `window.sero.models.list()` return type — adjust to match actual type)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/profiles/TierPicker.tsx
git commit -m "feat: create TierPicker onboarding component for model tier selection"
```

---

### Task 13: Integrate TierPicker into OnboardingWizard

**Files:**
- Modify: `apps/desktop/src/components/profiles/OnboardingWizard.tsx`

Add a `tiers` phase between auth and memory setup.

- [ ] **Step 1: Update OnboardingWizard phases and flow**

In `apps/desktop/src/components/profiles/OnboardingWizard.tsx`:

Add import:
```ts
import { TierPicker } from './TierPicker';
import type { ModelTierSettings } from '@/types/ipc';
```

Update the Phase type (line 44):
```ts
type Phase = 'checking' | 'auth' | 'tiers' | 'launching' | 'error' | 'done';
```

Update the initial check (lines 74-78) — after auth is confirmed, go to tiers instead of directly to memory:

Replace:
```ts
        if (hasAuth) {
          // Auth present (copied at creation) → launch memory setup
          launchMemorySession();
        } else {
```

With:
```ts
        if (hasAuth) {
          // Auth present (copied at creation) → check if tiers are configured
          const tiers = await window.sero.modelTiers.get();
          if (Object.keys(tiers).length > 0) {
            // Tiers already configured (copied from source profile)
            launchMemorySession();
          } else {
            setPhase('tiers');
          }
        } else {
```

Update `handleLoginComplete` (line 127-130) to go to tiers:

Replace:
```ts
  const handleLoginComplete = useCallback(() => {
    setShowLoginDialog(false);
    launchMemorySession();
  }, [launchMemorySession]);
```

With:
```ts
  const handleLoginComplete = useCallback(() => {
    setShowLoginDialog(false);
    setPhase('tiers');
  }, []);
```

Update `handleSkipAuth` (line 133-135) to go to tiers:

Replace:
```ts
  const handleSkipAuth = useCallback(() => {
    launchMemorySession();
  }, [launchMemorySession]);
```

With:
```ts
  const handleSkipAuth = useCallback(() => {
    setPhase('tiers');
  }, []);
```

Add tier completion handlers:

```ts
  const handleTierComplete = useCallback(async (tiers: ModelTierSettings) => {
    try {
      await window.sero.modelTiers.set(tiers);
    } catch (err) {
      console.warn('[onboarding] Failed to save model tiers:', err);
    }
    launchMemorySession();
  }, [launchMemorySession]);

  const handleTierSkip = useCallback(() => {
    launchMemorySession();
  }, [launchMemorySession]);
```

Update the null-return gate (line 138):

Replace:
```ts
  if (phase === 'checking' || phase === 'done') return null;
```

With:
```ts
  if (phase === 'checking' || phase === 'done') return null;
```

(Same — no change needed here.)

Add the tiers dialog before the auth dialog in the JSX return:

```tsx
      <Dialog open={phase === 'tiers'} onOpenChange={() => {/* prevent close */}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Choose your default models</DialogTitle>
            <DialogDescription>
              Pick which models to use for different task complexities.
              You can change these anytime in settings.
            </DialogDescription>
          </DialogHeader>
          <TierPicker onComplete={handleTierComplete} onSkip={handleTierSkip} />
        </DialogContent>
      </Dialog>
```

- [ ] **Step 2: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/profiles/OnboardingWizard.tsx
git commit -m "feat: integrate TierPicker into onboarding wizard between auth and memory"
```

---

### Task 14: Update ProfileForm clone message

**Files:**
- Modify: `apps/desktop/src/components/profiles/ProfileForm.tsx`

Update the "Copy credentials" checkbox label to mention model preferences.

- [ ] **Step 1: Update checkbox label**

In `apps/desktop/src/components/profiles/ProfileForm.tsx`, find the checkbox label for credential copying (likely around line 151). It should say something like "Copy credentials from current profile".

Replace the label text with:

```
Copy credentials and model preferences from current profile
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/components/profiles/ProfileForm.tsx
git commit -m "feat: update profile clone label to mention model preferences"
```

---

### Task 15: Update all agent templates to use structured model fields

**Files:**
- Modify: `packages/templates/agents/scout.md`
- Modify: `packages/templates/agents/analyst.md`
- Modify: `packages/templates/agents/planner.md`
- Modify: `packages/templates/agents/implementer.md`
- Modify: `packages/templates/agents/reviewer.md`
- Modify: `packages/templates/agents/spec-reviewer.md`
- Modify: `packages/templates/agents/quality-reviewer.md`
- Modify: `packages/templates/agents/test-writer.md`
- Modify: `packages/templates/agents/researcher.md`
- Modify: `packages/templates/agents/research-analyst.md`
- Modify: `packages/templates/agents/visionary.md`
- Modify: `packages/templates/agents/collab-analyst.md`
- Modify: `packages/templates/agents/coordinator.md`

Replace all hardcoded `"model": "claude-*"` with structured `{ prefer, fallbacks }` fields.

- [ ] **Step 1: Update LOW tier template (scout)**

In `packages/templates/agents/scout.md`, replace:
```json
"model": "claude-haiku-4-5",
```
With:
```json
"model": { "prefer": "LOW", "fallbacks": ["gpt-4.1-mini", "claude-haiku-4-5", "gemini-2.5-flash"] },
```

- [ ] **Step 2: Update MED tier templates**

For each of these files, replace `"model": "claude-sonnet-4-6"` with the MED tier structured field:

**analyst.md, implementer.md, reviewer.md, researcher.md, test-writer.md, spec-reviewer.md, quality-reviewer.md, research-analyst.md, visionary.md, collab-analyst.md:**

```json
"model": { "prefer": "MED", "fallbacks": ["gpt-5.4", "claude-sonnet-4-6", "gemini-2.5-pro"] },
```

- [ ] **Step 3: Update HIGH tier templates**

For **planner.md** and **coordinator.md**, replace `"model": "claude-sonnet-4-6"` with:

```json
"model": { "prefer": "HIGH", "fallbacks": ["gpt-5.4", "claude-sonnet-4-6", "gemini-2.5-pro"] },
```

- [ ] **Step 4: Verify all templates are updated**

Run: `grep -r '"model": "claude-' packages/templates/agents/`
Expected: No matches — all templates should use the structured format now.

- [ ] **Step 5: Commit**

```bash
git add packages/templates/agents/
git commit -m "feat: update all agent templates to use structured model fields with tier aliases"
```

---

### Deferred: Inline model picker on resolution failure

The spec describes an inline model picker UI that appears in the chat area when no model can be resolved. This is a significant UI feature (new component, agent-pool integration, IPC for user selection mid-prompt). The current implementation gracefully falls back to the first available model in the registry, which handles the common case. The inline picker can be built as a follow-up once the tier system is proven in use.

---

### Task 16: Final typecheck and integration verification

**Files:** None (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS with zero errors across all packages

- [ ] **Step 2: Verify no remaining hardcoded Claude defaults**

Run these checks:

```bash
# Check for hardcoded claude defaults in bootstrap/infra code (should find none)
grep -rn "defaultProvider.*anthropic\|defaultModel.*claude\|getModel.*anthropic.*claude" \
  apps/desktop/electron/main.ts \
  apps/desktop/electron/shared/infra/shared-infra.ts

# Check agent templates have no plain claude model strings
grep -rn '"model": "claude-' packages/templates/agents/
```

Expected: No matches for either command.

- [ ] **Step 3: Verify structured model fields exist in templates**

```bash
grep -c '"prefer"' packages/templates/agents/*.md
```

Expected: 13 matches (one per template file).

- [ ] **Step 4: Commit any remaining fixes**

If typecheck revealed issues, fix and commit:

```bash
git add -A
git commit -m "fix: resolve remaining type errors from dynamic model provider changes"
```

---

### Task 17: Add IPC bridge for models.list (if missing)

**Files:**
- Verify: `apps/desktop/electron/preload.ts` (or wherever the preload bridge is)
- Verify: `apps/desktop/src/types/electron.d.ts`

The TierPicker component calls `window.sero.models.list()`. Verify this IPC bridge exists and works. If it doesn't exist, add it.

- [ ] **Step 1: Check if models.list bridge exists**

Search for `models.list` or `IpcChannels.models.list` in the preload file. The handler already exists in `electron/ipc/agent/handlers/models.ts` — verify the preload bridge exposes it on `window.sero.models.list`.

- [ ] **Step 2: Add bridge if missing**

If the bridge doesn't exist, add to preload:

```ts
models: {
  list: () => ipcRenderer.invoke(IpcChannels.models.list),
},
```

And to `electron.d.ts`:

```ts
models: {
  list(): Promise<import('./ipc').AvailableModelGroup[]>;
};
```

- [ ] **Step 3: Run typecheck**

Run: `cd <repo-root> && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit if changes were needed**

```bash
git add apps/desktop/electron/preload.ts apps/desktop/src/types/electron.d.ts
git commit -m "feat: expose models.list IPC bridge for tier picker"
```
