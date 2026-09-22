/**
 * Project model resolution (spec architect-model-overrides).
 *
 * A project override wins for its tier, then the global selection. Explicit
 * selections stay above both and are reported as their own source. Nothing
 * falls back to a different provider.
 */

import { describe, expect, it } from 'vitest';
import type { SharedAvailableModelGroup, SharedModelTierSettings } from '@sero-ai/common';
import { createProjectRecord, type ProjectRecord } from '../../shared/record';
import { clearProjectTierOverride, setProjectTierOverride } from '../../shared/model-config';
import {
  resolveDispatchSnapshot,
  resolveOwnerSelection,
  resolveProjectContext,
  resolveTierSelections,
  type ModelCatalogue,
} from '../model-resolution';
import { sameOrchestratorProjectAttribution } from '@sero-ai/common';

const T0 = '2026-09-14T09:12:00.000Z';

const GROUPS: SharedAvailableModelGroup[] = [
  {
    provider: 'anthropic', displayName: 'Anthropic', logo: '',
    models: [
      { provider: 'anthropic', modelId: 'haiku', name: 'Haiku', reasoning: true, availableThinkingLevels: ['off', 'low', 'medium'] },
      { provider: 'anthropic', modelId: 'sonnet', name: 'Sonnet', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
      { provider: 'anthropic', modelId: 'opus', name: 'Opus', reasoning: true, availableThinkingLevels: ['medium', 'high'] },
    ],
  },
  {
    provider: 'openai', displayName: 'OpenAI', logo: '',
    models: [{ provider: 'openai', modelId: 'gpt-codex', name: 'GPT Codex', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] }],
  },
];

const GLOBAL_TIERS: SharedModelTierSettings = {
  LOW: { provider: 'anthropic', modelId: 'haiku', thinkingLevel: 'low' },
  MED: { provider: 'anthropic', modelId: 'sonnet', thinkingLevel: 'medium' },
  HIGH: { provider: 'anthropic', modelId: 'opus', thinkingLevel: 'high' },
};

function catalogue(env: NodeJS.ProcessEnv = {}): ModelCatalogue {
  return { listModels: async () => GROUPS, modelTiers: async () => GLOBAL_TIERS, env };
}

const project = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
  ...createProjectRecord({ id: 'proj_a', name: 'A', idea: 'idea', folder: '~/p', now: T0 }),
  modelTiers: GLOBAL_TIERS,
  ...overrides,
});

describe('tier resolution', () => {
  it('uses a project override for its tier and inherits the rest from global', async () => {
    const record = setProjectTierOverride(project(), 'MED', { provider: 'openai', modelId: 'gpt-codex', thinkingLevel: 'medium' });
    const resolved = await resolveTierSelections(catalogue(), record);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const byTier = Object.fromEntries(resolved.value.map((entry) => [entry.tier, entry]));
    expect(byTier.MED).toMatchObject({ model: 'openai/gpt-codex', thinking: 'medium', source: 'project-override' });
    expect(byTier.LOW).toMatchObject({ model: 'anthropic/haiku', source: 'inherited-global' });
    expect(byTier.HIGH).toMatchObject({ model: 'anthropic/opus', source: 'inherited-global' });
  });

  it('restores inheritance when the override is cleared, without touching other tiers', async () => {
    const overridden = setProjectTierOverride(project(), 'HIGH', { provider: 'openai', modelId: 'gpt-codex', thinkingLevel: 'high' });
    const cleared = clearProjectTierOverride(overridden, 'HIGH');
    const resolved = await resolveTierSelections(catalogue(), cleared);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const high = resolved.value.find((entry) => entry.tier === 'HIGH');
    expect(high).toMatchObject({ model: 'anthropic/opus', source: 'inherited-global' });
    // The revision advanced, so an operation can record which revision it used.
    expect(cleared.modelConfigRevision).toBe(2);
    expect(cleared.modelOverrides).toEqual({});
  });

  it('keeps two projects independent', async () => {
    const a = setProjectTierOverride(project({ id: 'proj_a' }), 'MED', { provider: 'openai', modelId: 'gpt-codex' });
    const b = project({ id: 'proj_b' });
    const c = catalogue();
    const [resolvedA, resolvedB] = await Promise.all([
      resolveTierSelections(c, a),
      resolveTierSelections(c, b),
    ]);
    expect(resolvedA.ok && resolvedA.value.find((entry) => entry.tier === 'MED')?.model).toBe('openai/gpt-codex');
    expect(resolvedB.ok && resolvedB.value.find((entry) => entry.tier === 'MED')?.model).toBe('anthropic/sonnet');
    // Saving one project's override never changed the global selection.
    expect(GLOBAL_TIERS.MED).toMatchObject({ modelId: 'sonnet' });
  });

  it('refuses an unavailable model instead of switching provider', async () => {
    const record = setProjectTierOverride(project(), 'MED', { provider: 'openai', modelId: 'retired-model' });
    const resolved = await resolveTierSelections(catalogue(), record);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain('openai/retired-model');
    expect(resolved.error).toContain('unavailable');
    // The refusal never names a substitute.
    expect(resolved.error).not.toContain('sonnet');
  });

  it('refuses an unsupported thinking level and lists what is supported', async () => {
    const record = setProjectTierOverride(project(), 'MED', { provider: 'anthropic', modelId: 'opus', thinkingLevel: 'low' });
    const resolved = await resolveTierSelections(catalogue(), record);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain('does not support low thinking');
    expect(resolved.error).toContain('medium');
  });

  it('leaves a tier with no selection out of the result rather than guessing one', async () => {
    const resolved = await resolveTierSelections(catalogue(), project({ modelTiers: {} }));
    expect(resolved).toEqual({ ok: true, value: [] });
  });
});

describe('owner resolution', () => {
  it('reports the environment pin as its own source, not as a tier', async () => {
    const record = setProjectTierOverride(project(), 'MED', { provider: 'anthropic', modelId: 'sonnet' });
    const resolved = await resolveOwnerSelection(catalogue({ SERO_ARCHITECT_MODEL: 'openai/gpt-codex:high' }), record);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value).toMatchObject({
      tier: null, model: 'openai/gpt-codex', thinking: 'high', source: 'owner-environment-pin',
    });
    // The owner row must not claim the project MED default it is not using.
    expect(resolved.value.model).not.toBe('anthropic/sonnet');
  });

  it('falls back to the MED tier with its own provenance when no pin exists', async () => {
    const record = setProjectTierOverride(project(), 'MED', { provider: 'openai', modelId: 'gpt-codex' });
    const resolved = await resolveOwnerSelection(catalogue(), record);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value).toMatchObject({ tier: 'MED', model: 'openai/gpt-codex', source: 'project-override' });
  });

  it('refuses an unknown pin thinking level and an unavailable pin without switching provider', async () => {
    const bad = await resolveOwnerSelection(catalogue({ SERO_ARCHITECT_MODEL: 'openai/gpt-codex:turbo' }), project());
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('unknown thinking level');

    const missing = await resolveOwnerSelection(catalogue({ SERO_ARCHITECT_MODEL: 'openai/retired' }), project());
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toContain('owner environment pin');
      expect(missing.error).toContain('unavailable');
    }
  });

  it('refuses when the project selects no MED model at all', async () => {
    const resolved = await resolveOwnerSelection(catalogue(), project({ modelTiers: { LOW: GLOBAL_TIERS.LOW } }));
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toContain('Select the MED model in Admin');
  });
});

describe('dispatch snapshot', () => {
  it('carries only the selected tiers, each with its provenance', async () => {
    const record = setProjectTierOverride(project(), 'MED', { provider: 'openai', modelId: 'gpt-codex', thinkingLevel: 'medium' });
    const snapshot = await resolveDispatchSnapshot(catalogue(), record);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.MED).toEqual({
      provider: 'openai', modelId: 'gpt-codex', thinkingLevel: 'medium', source: expect.stringContaining('project override'),
    });
    expect(snapshot.value.LOW).toMatchObject({ modelId: 'haiku', source: expect.stringContaining('inherited global') });
    // A tier the project does not select stays absent, so the consumer inherits.
    expect(Object.keys(snapshot.value)).toEqual(['LOW', 'MED', 'HIGH']);
  });

  it('keeps a model id that contains a separator, and an explicit off', async () => {
    const routed: SharedAvailableModelGroup = {
      provider: 'openrouter', displayName: 'OpenRouter', logo: '',
      models: [{ provider: 'openrouter', modelId: 'anthropic/claude', name: 'Claude via OpenRouter', reasoning: true, availableThinkingLevels: ['off', 'low'] }],
    };
    const source: ModelCatalogue = { listModels: async () => [...GROUPS, routed], modelTiers: async () => GLOBAL_TIERS, env: {} };
    const pin = await resolveOwnerSelection({ ...source, env: { SERO_ARCHITECT_MODEL: 'openrouter/anthropic/claude:off' } }, project());
    expect(pin).toMatchObject({ ok: true, value: { model: 'openrouter/anthropic/claude', thinking: 'off' } });
    const record = setProjectTierOverride(project(), 'LOW', { provider: 'openrouter', modelId: 'anthropic/claude', thinkingLevel: 'off' });
    const snapshot = await resolveDispatchSnapshot(source, record);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    // Truncating at the second separator would snapshot a different model, and
    // dropping `off` would let the delegate fall back to its step's thinking.
    expect(snapshot.value.LOW).toMatchObject({ provider: 'openrouter', modelId: 'anthropic/claude', thinkingLevel: 'off' });
  });

  it('refuses rather than emitting a partial snapshot', async () => {
    const record = setProjectTierOverride(project(), 'HIGH', { provider: 'anthropic', modelId: 'opus', thinkingLevel: 'low' });
    const snapshot = await resolveDispatchSnapshot(catalogue(), record);
    expect(snapshot.ok).toBe(false);
  });
});

describe('dispatch project context', () => {
  it('carries the project display name as a display-only snapshot', async () => {
    const named = await resolveProjectContext(catalogue(), project({ name: 'DungeonExplorer' }));
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(named.value.projectName).toBe('DungeonExplorer');
    // The name is display only: it never changes what makes two requests the same.
    expect(sameOrchestratorProjectAttribution(named.value, { ...named.value, projectName: 'Renamed' })).toBe(true);
    expect(sameOrchestratorProjectAttribution(named.value, { ...named.value, runId: 'run-other' })).toBe(false);

    const unnamed = await resolveProjectContext(catalogue(), project({ name: '' }));
    expect(unnamed.ok).toBe(true);
    if (!unnamed.ok) return;
    expect(unnamed.value.projectName).toBeUndefined();
  });
});
