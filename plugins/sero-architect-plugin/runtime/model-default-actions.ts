/**
 * Project model tier defaults.
 *
 * Split from the management actions to keep each file within the 500-LOC limit.
 * A tier default changes what later dispatches resolve, so the checked model, the
 * new revision and what happens to work already in flight are reported together.
 */

import type { ModelTier, SharedModelTierEntry, SharedModelTierSettings, ThinkingLevel } from '@sero-ai/common';

import { clearProjectTierOverride, setProjectTierOverride } from '../shared/model-config';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import { validateEntry } from './model-resolution';
import type { ProjectsOutcome } from './projects-actions';
import { mutateRecord, type RecordStore } from './record-store';

export interface ModelDefaultInput {
  tier: ModelTier;
  /** `provider/modelId`. */
  model: string;
  thinking?: ThinkingLevel;
}

export interface ModelDefaultDeps {
  host: ArchitectHost;
  store: RecordStore;
}

const refuse = (text: string): ProjectsOutcome => ({ ok: false, text });
const ok = (text: string): ProjectsOutcome => ({ ok: true, text });

/**
 * Says which revision now applies and what it does to work already dispatched.
 *
 * A change is not retroactive: a dispatch that already resolved keeps the models
 * it was resolved with, so a reader has to be told that rather than left to
 * assume the change reached everything.
 */
function modelChangeText(record: ProjectRecord, change: string): string {
  const revision = record.modelConfigRevision ?? 0;
  const keeping = record.milestones.filter((milestone) => milestone.dispatch).length;
  const held = keeping === 1 ? '1 existing dispatch keeps' : `${keeping} existing dispatches keep`;
  return `${change}. New dispatches use revision ${revision}. `
    + (keeping === 0 ? 'No existing dispatch is affected.' : `${held} revision ${Math.max(0, revision - 1)}.`);
}

/** Saves one tier default. An unavailable model or thinking level is refused. */
export async function setModelDefaultAction(
  deps: ModelDefaultDeps,
  projectId: string,
  input: ModelDefaultInput,
): Promise<ProjectsOutcome> {
  const separator = input.model.indexOf('/');
  if (separator <= 0 || separator === input.model.length - 1) return refuse('Name the model as provider/modelId.');
  const entry: SharedModelTierEntry = { provider: input.model.slice(0, separator), modelId: input.model.slice(separator + 1) };
  if (input.thinking) entry.thinkingLevel = input.thinking;
  // Checked against the real catalogue first: an unavailable model or an
  // unsupported thinking level is refused, never silently replaced.
  const checked = validateEntry(await deps.host.listModels(), entry);
  if (!checked.ok) return refuse(checked.error);
  const result = await mutateRecord(deps.store, projectId, (record) => ({
    record: setProjectTierOverride(record, input.tier, entry),
  }));
  if (!result.ok) return refuse(result.error);
  return ok(modelChangeText(result.record, `${input.tier} is now ${checked.value.model} with ${checked.value.thinking} thinking`));
}

/** Clears one default so the tier inherits the global selection again. */
export async function clearModelDefaultAction(
  deps: ModelDefaultDeps,
  projectId: string,
  tier: ModelTier,
): Promise<ProjectsOutcome> {
  const result = await mutateRecord(deps.store, projectId, (record) => ({
    record: clearProjectTierOverride(record, tier),
  }));
  if (!result.ok) return refuse(result.error);
  return ok(modelChangeText(result.record, `${tier} inherits the global selection again`));
}

/**
 * Re-reads the host's global model tiers into the cached record and returns
 * what it read. The owner session only refreshes that cache when it opens;
 * the project settings view asks here so an inherited tier is never shown, or
 * pinned, from a stale copy.
 */
export async function refreshModelTiersAction(
  deps: ModelDefaultDeps,
  projectId: string,
): Promise<ProjectsOutcome & { tiers?: SharedModelTierSettings }> {
  const modelTiers = await deps.host.modelTiers();
  const result = await mutateRecord(deps.store, projectId, (fresh) => ({ record: { ...fresh, modelTiers } }));
  if (!result.ok) return refuse(result.error);
  return { ok: true, text: 'Model tiers refreshed from the host.', tiers: modelTiers };
}
