/**
 * Pure fan-out expansion and aggregation (specs/17-dynamic-fan-out.md).
 *
 * Expansion turns the upstream collection into an immutable manifest of
 * activation identities; aggregation joins the finished activations into one
 * StepOutcome downstream steps consume. Both are pure so they unit-test
 * directly; the engine-side wave execution lives in fan-out-run.ts.
 */

import type {
  FanOutAggregate,
  FanOutDefinition,
  FanOutManifest,
  FanOutManifestItem,
  Loop,
  LoopRun,
  LoopStepDefinition,
  StepActivation,
  StepOutcome,
} from '../shared/types';
import { fanOutResultsVariable } from '../shared/fanout-types';

/** Stable activation id within a run: `<runId>:<stepId>:<normalised-key>`. */
export function fanOutActivationId(runId: string, stepId: string, key: string): string {
  return `${runId}:${stepId}:${key}`;
}

/**
 * Normalises an item key to the same safe-slug alphabet as step ids: keys are
 * interpolated into activation ids and artifact file names.
 */
function normaliseKey(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export type FanOutExpansion =
  | { ok: true; manifest: FanOutManifest }
  | { ok: false; reason: string };

function keySample(keys: string[]): string {
  const sample = keys.slice(0, 5).join(', ');
  return keys.length > 5 ? `${sample}, …` : sample;
}

function itemKeys(fanOut: FanOutDefinition, items: unknown[]): { keys: string[] } | { error: string } {
  if (!fanOut.itemKey) return { keys: items.map((_, index) => String(index)) };
  const keys: string[] = [];
  for (const [index, item] of items.entries()) {
    const raw =
      typeof item === 'object' && item !== null && !Array.isArray(item)
        ? (item as Record<string, unknown>)[fanOut.itemKey]
        : undefined;
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      return { error: `item ${index} of "${fanOut.itemsFrom}" has no usable "${fanOut.itemKey}" key (need a string or number)` };
    }
    const key = normaliseKey(String(raw));
    if (!key) return { error: `item ${index} of "${fanOut.itemsFrom}" has an empty "${fanOut.itemKey}" key after normalisation` };
    const duplicate = keys.indexOf(key);
    if (duplicate !== -1) {
      return { error: `duplicate activation key "${key}" (items ${duplicate} and ${index} of "${fanOut.itemsFrom}") — keys must be unique` };
    }
    keys.push(key);
  }
  return { keys };
}

/**
 * Expands the upstream collection into a manifest, or refuses with a precise
 * reason (missing/non-array source, bounds violated, bad or duplicate keys).
 * A refusal blocks the step — work is never silently truncated.
 */
export function expandFanOut(loop: Loop, run: LoopRun, step: LoopStepDefinition, now: string): FanOutExpansion {
  const fanOut = step.fanOut!;
  const source = loop.runtime.variables[fanOut.itemsFrom];
  if (source === undefined) {
    return { ok: false, reason: `fan-out step "${step.id}": source variable "${fanOut.itemsFrom}" was never recorded by an upstream step` };
  }
  if (!Array.isArray(source)) {
    return { ok: false, reason: `fan-out step "${step.id}": source variable "${fanOut.itemsFrom}" must be an array, got ${typeof source}` };
  }
  const minItems = fanOut.minItems ?? 1;
  if (source.length < minItems) {
    return {
      ok: false,
      reason: `fan-out step "${step.id}": "${fanOut.itemsFrom}" has ${source.length} item(s), below the required minimum of ${minItems}`,
    };
  }
  const keyed = itemKeys(fanOut, source);
  if ('error' in keyed) return { ok: false, reason: `fan-out step "${step.id}": ${keyed.error}` };
  if (source.length > fanOut.maxItems) {
    return {
      ok: false,
      reason:
        `fan-out step "${step.id}": "${fanOut.itemsFrom}" has ${source.length} items but the plan allows at most ${fanOut.maxItems} ` +
        `(keys: ${keySample(keyed.keys)}). Reduce the collection in the upstream step or raise the plan's fanOut.maxItems.`,
    };
  }
  const items: FanOutManifestItem[] = source.map((item, index) => ({
    activationId: fanOutActivationId(run.id, step.id, keyed.keys[index]),
    key: keyed.keys[index],
    index,
    item,
  }));
  return {
    ok: true,
    manifest: {
      runId: run.id,
      stepId: step.id,
      sourceVariable: fanOut.itemsFrom,
      createdAt: now,
      itemCount: items.length,
      items,
    },
  };
}

/** This step's fan-out activations recorded on the run, in manifest order. */
export function fanOutActivations(run: LoopRun, manifest: FanOutManifest): StepActivation[] {
  const byId = new Map((run.stepActivations ?? []).map((a) => [a.id, a]));
  return manifest.items.flatMap((item) => byId.get(item.activationId) ?? []);
}

const SETTLED = new Set<StepActivation['status']>(['succeeded', 'skipped']);

/** Activations that still need to run: everything not settled (a retry re-runs failures only). */
export function runnableFanOutActivations(run: LoopRun, manifest: FanOutManifest): StepActivation[] {
  return fanOutActivations(run, manifest).filter((a) => !SETTLED.has(a.status) && a.status !== 'running');
}

/** Joins the terminal activations into the aggregate downstream steps read. */
export function buildFanOutAggregate(manifest: FanOutManifest, activations: StepActivation[]): FanOutAggregate {
  const byId = new Map(activations.map((a) => [a.id, a]));
  const results = manifest.items.map((item) => {
    const activation = byId.get(item.activationId);
    return {
      activationId: item.activationId,
      key: item.key,
      index: item.index,
      status: activation?.status ?? 'pending',
      variables: activation?.outcome?.variables,
      summary: activation?.outcome?.summary,
      error: activation?.status === 'failed' || activation?.status === 'blocked' ? activation.outcome?.summary : undefined,
    };
  });
  const count = (statuses: StepActivation['status'][]) => results.filter((r) => statuses.includes(r.status)).length;
  const succeeded = count(['succeeded']);
  const skipped = count(['skipped']);
  return {
    stepId: manifest.stepId,
    total: manifest.itemCount,
    succeeded,
    failed: count(['failed', 'blocked', 'needs-revision']),
    skipped,
    cancelled: count(['cancelled', 'orphaned']),
    partial: succeeded + skipped < manifest.itemCount,
    results,
  };
}

/**
 * The step-level join outcome. All activations settled ⇒ succeeded and the
 * aggregate is recorded under `<itemsFrom>Results`; anything else ⇒ failed with
 * the offending keys named, so recovery can retry just those activations.
 */
export function fanOutJoinOutcome(step: LoopStepDefinition, aggregate: FanOutAggregate): StepOutcome {
  if (!aggregate.partial) {
    return {
      status: 'succeeded',
      summary: `Fan-out "${step.id}": ${aggregate.succeeded} of ${aggregate.total} activation(s) succeeded${aggregate.skipped ? ` (${aggregate.skipped} skipped)` : ''}.`,
      variables: { [fanOutResultsVariable(step.fanOut!)]: aggregate },
    };
  }
  const unsettled = aggregate.results.filter((r) => r.status !== 'succeeded' && r.status !== 'skipped');
  return {
    status: 'failed',
    summary:
      `Fan-out "${step.id}": ${unsettled.length} of ${aggregate.total} activation(s) did not succeed ` +
      `(${keySample(unsettled.map((r) => `${r.key}: ${r.status}`))}).`,
  };
}
