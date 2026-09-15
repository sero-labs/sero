/**
 * Project model resolution (spec architect-model-overrides).
 *
 * One order, always: a project override wins for its tier, then the global
 * selection. Explicit selections stay above both — the owner environment pin
 * and a manual step pin — and every result says which of them chose it.
 *
 * Nothing here falls back to another provider. An unavailable model or an
 * unsupported thinking level is refused with a message the user can act on.
 */

import type { ModelTier, SharedAvailableModelGroup, SharedModelInfo, SharedModelTierEntry, SharedModelTierSettings, ThinkingLevel } from '@sero-ai/common';
import { MODEL_TIERS, isThinkingLevel, modelKey } from '@sero-ai/common';

import type { OrchestratorProjectContext, OrchestratorProjectModelSnapshot } from '@sero-ai/common';
import { resolveEffectiveTiers, type ModelConfigSource, type TierSelectionSource } from '../shared/model-config';
import { activeRun } from '../shared/runs';
import type { ProjectRecord } from '../shared/record';

/** Where a resolved selection came from. The UI shows this next to the model. */
export type SelectionSource = TierSelectionSource | 'owner-environment-pin' | 'manual-pin';

export interface ResolvedSelection {
  /** The tier this selection belongs to. Null for the owner's environment pin. */
  tier: ModelTier | null;
  /** `provider/modelId`. */
  model: string;
  thinking: ThinkingLevel;
  source: SelectionSource;
  /** Short provenance for a UI or a journal record. */
  detail: string;
}

export type ResolutionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The global selections are authoritative on the host (Admin). A record's
 * `modelTiers` is only the cached copy shown before work is approved, so it is
 * never the source of truth: the record contributes its overrides, and the host
 * contributes the tiers those overrides fall back to.
 */
export function projectModelSource(
  record: Pick<ProjectRecord, 'modelOverrides' | 'modelConfigRevision'>,
  globals: SharedModelTierSettings,
): ModelConfigSource {
  return {
    modelTiers: globals,
    ...(record.modelOverrides ? { modelOverrides: record.modelOverrides } : {}),
    ...(record.modelConfigRevision !== undefined ? { modelConfigRevision: record.modelConfigRevision } : {}),
  };
}

/** The catalogue surface resolution needs. */
export interface ModelCatalogue {
  listModels(): Promise<SharedAvailableModelGroup[]>;
  modelTiers(): Promise<SharedModelTierSettings>;
  env?: NodeJS.ProcessEnv;
}

function flatten(groups: SharedAvailableModelGroup[]): SharedModelInfo[] {
  return groups.flatMap((group) => group.models);
}

/** The catalogue entry for a `provider/modelId`, or undefined when it is unavailable. */
export function findCatalogueModel(groups: SharedAvailableModelGroup[], reference: string): SharedModelInfo | undefined {
  return flatten(groups).find((model) => modelKey(model.provider, model.modelId) === reference);
}

/**
 * Validates one entry against the available catalogue. An unavailable model or
 * an unsupported thinking level produces an actionable refusal. The caller
 * never substitutes a different provider.
 */
export function validateEntry(groups: SharedAvailableModelGroup[], entry: SharedModelTierEntry): ResolutionResult<{ model: string; thinking: ThinkingLevel }> {
  const model = modelKey(entry.provider, entry.modelId);
  const picked = findCatalogueModel(groups, model);
  if (!picked) {
    return { ok: false, error: `The model ${model} is unavailable. Install it or select an available model.` };
  }
  if (!picked.reasoning) return { ok: true, value: { model, thinking: 'off' } };
  const thinking = entry.thinkingLevel ?? 'medium';
  const supported = picked.availableThinkingLevels;
  if (supported?.length && !supported.some((level) => level === thinking)) {
    return {
      ok: false,
      error: `The model ${model} does not support ${thinking} thinking. Supported levels: ${supported.join(', ')}.`,
    };
  }
  return { ok: true, value: { model, thinking } };
}

const SOURCE_DETAIL: Record<SelectionSource, string> = {
  'project-override': 'project override',
  'inherited-global': 'inherited global',
  'owner-environment-pin': 'owner environment pin',
  'manual-pin': 'manual step pin',
};

/**
 * Resolves every tier the project selects, honouring project overrides and
 * global inheritance. A tier with no selection at all is left out: the caller
 * decides whether that is a refusal, and no provider is guessed here.
 */
export async function resolveTierSelections(
  catalogue: ModelCatalogue,
  source: ModelConfigSource,
): Promise<ResolutionResult<ResolvedSelection[]>> {
  const groups = await catalogue.listModels();
  const resolved: ResolvedSelection[] = [];
  for (const tier of resolveEffectiveTiers(source)) {
    const checked = validateEntry(groups, tier.entry);
    if (!checked.ok) return { ok: false, error: `The ${tier.tier} tier cannot be used: ${checked.error}` };
    resolved.push({
      tier: tier.tier,
      model: checked.value.model,
      thinking: checked.value.thinking,
      source: tier.source,
      detail: `${SOURCE_DETAIL[tier.source]} rev ${source.modelConfigRevision ?? 0}`,
    });
  }
  return { ok: true, value: resolved };
}

/**
 * Resolves the owner's selection.
 *
 * The existing `SERO_ARCHITECT_MODEL` override keeps its precedence and is
 * reported as its own source, so the UI never claims the owner uses a tier it
 * does not. Without the pin, the MED tier applies through the same order as
 * every other tier.
 */
export async function resolveOwnerSelection(
  catalogue: ModelCatalogue,
  source: ModelConfigSource,
): Promise<ResolutionResult<ResolvedSelection>> {
  const groups = await catalogue.listModels();
  const pin = catalogue.env?.SERO_ARCHITECT_MODEL?.trim();
  const [reference, pinThinking] = pin?.split(':') ?? [];
  if (reference) {
    if (pinThinking !== undefined && !isThinkingLevel(pinThinking)) {
      return { ok: false, error: `The owner environment pin names an unknown thinking level: ${pinThinking}.` };
    }
    const entry = findEntryForReference(source, reference);
    const pinned: SharedModelTierEntry = pinThinking ? { ...entry, thinkingLevel: pinThinking } : entry;
    const checked = validateEntry(groups, pinned);
    if (!checked.ok) return { ok: false, error: `The owner environment pin cannot be used: ${checked.error}` };
    return {
      ok: true,
      value: {
        tier: null,
        model: checked.value.model,
        thinking: checked.value.thinking,
        source: 'owner-environment-pin',
        detail: 'SERO_ARCHITECT_MODEL overrides the project tier',
      },
    };
  }
  const tiers = await resolveTierSelections(catalogue, source);
  if (!tiers.ok) return tiers;
  const med = tiers.value.find((selection) => selection.tier === 'MED');
  if (!med) {
    return { ok: false, error: 'Select the MED model in Admin before starting the Architect.' };
  }
  return { ok: true, value: { ...med, detail: `${SOURCE_DETAIL[med.source]} rev ${source.modelConfigRevision ?? 0}` } };
}

/** The split of a `provider/modelId` reference into a catalogue entry. */
function findEntryForReference(source: ModelConfigSource, reference: string): SharedModelTierEntry {
  const saved = MODEL_TIERS
    .map((tier) => source.modelOverrides?.[tier] ?? source.modelTiers?.[tier])
    .find((entry) => entry && modelKey(entry.provider, entry.modelId) === reference);
  if (saved) return saved;
  const separator = reference.indexOf('/');
  const provider = separator < 0 ? '' : reference.slice(0, separator);
  const modelId = separator < 0 ? reference : reference.slice(separator + 1);
  return { provider, modelId };
}

/**
 * The context a dispatch carries: its project and run identity, the
 * configuration revision, and the tier defaults in force right now.
 *
 * Resolved before planning so every descendant call of this dispatch resolves
 * the same models, and a restart recovers the same answer instead of a new one.
 */
export async function resolveProjectContext(
  catalogue: ModelCatalogue,
  record: ProjectRecord,
): Promise<ResolutionResult<OrchestratorProjectContext>> {
  const snapshot = await resolveDispatchSnapshot(catalogue, record);  if (!snapshot.ok) return snapshot;
  const open = activeRun(record);
  return {
    ok: true,
    value: {
      projectId: record.id,
      // A dispatch always happens inside a run; the initial one covers any gap.
      runId: open?.id ?? `run-initial-${record.id}`,
      configRevision: record.modelConfigRevision ?? 0,
      modelSnapshot: snapshot.value,
    },
  };
}

/**
 * The snapshot a new Workflow or Room carries. Tiers the project does not
 * select are omitted, so the consumer's own inheritance still applies.
 */
export async function resolveDispatchSnapshot(
  catalogue: ModelCatalogue,
  record: ProjectRecord,
): Promise<ResolutionResult<OrchestratorProjectModelSnapshot>> {
  const tiers = await resolveTierSelections(catalogue, projectModelSource(record, await catalogue.modelTiers()));
  if (!tiers.ok) return tiers;
  const snapshot: OrchestratorProjectModelSnapshot = {};
  for (const selection of tiers.value) {
    if (!selection.tier) continue;
    // Only the first separator divides provider from model: a model id may
    // itself contain one, and truncating it would snapshot a different model.
    const separator = selection.model.indexOf('/');
    const provider = separator === -1 ? '' : selection.model.slice(0, separator);
    const modelId = separator === -1 ? selection.model : selection.model.slice(separator + 1);
    // `off` is a selection too. Dropping it would let the delegate fall back to
    // its step's thinking, which is not what the project chose.
    snapshot[selection.tier] = {
      provider,
      modelId,
      thinkingLevel: selection.thinking,
      source: selection.detail,
    };
  }
  return { ok: true, value: snapshot };
}
