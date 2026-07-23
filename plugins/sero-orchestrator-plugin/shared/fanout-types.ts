/**
 * Bounded dynamic fan-out types (specs/17-dynamic-fan-out.md).
 *
 * A step may declare a fanOut so the RUNTIME expands it into one activation per
 * item of an upstream array variable. The plan stays static and validated; only
 * the activation count varies between runs, within planning-time bounds.
 */

import type { StepActivationStatus } from './activation-types';

/**
 * Host policy ceiling on `maxItems` regardless of planner output. Real fan-outs
 * use a handful to a few dozen items; anything larger multiplies cost and tool
 * activity beyond what one run should do, so validation rejects the plan.
 */
export const MAX_DYNAMIC_FAN_OUT_ITEMS = 50;

/** Statically declared fan-out bounds on a step. */
export interface FanOutDefinition {
  /**
   * Name of a loop variable produced by an upstream dependency ancestor.
   * Its runtime value must be an array.
   */
  itemsFrom: string;

  /** Variable name each activation receives its item under. */
  itemVariable: string;

  /**
   * Optional field name read from each item (which must then be an object) to
   * form the activation's stable key. Omitted ⇒ the item index is the key.
   */
  itemKey?: string;

  /** Minimum item count for the step to proceed. Default 1. */
  minItems?: number;

  /** Hard maximum number of activations created in one run. Mandatory. */
  maxItems: number;

  /** How many activations may execute at the same time. Default: no extra cap. */
  maxConcurrency?: number;

  /**
   * Behaviour when the collection exceeds maxItems. Only "block" is supported:
   * the step blocks with a visible report instead of silently dropping work.
   */
  overflow?: 'block';
}

/**
 * The persisted expansion of one fan-out step for one run, written BEFORE any
 * activation starts. Immutable once created: a restart or retry reconstructs
 * the exact same activations instead of re-expanding differently.
 */
export interface FanOutManifest {
  runId: string;
  stepId: string;
  sourceVariable: string;
  createdAt: string;
  itemCount: number;
  items: FanOutManifestItem[];
}

export interface FanOutManifestItem {
  activationId: string;
  key: string;
  index: number;
  item: unknown;
}

/** Durable per-step fan-out runtime state, keyed by step id on the loop runtime. */
export interface FanOutRuntimeState {
  manifest: FanOutManifest;
  /** Set when every activation is terminal; the join result downstream steps read. */
  aggregate?: FanOutAggregate;
}

/** The joined result of all activations, exposed to downstream steps. */
export interface FanOutAggregate {
  stepId: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  cancelled: number;
  /** True when any activation ended in something other than succeeded/skipped. */
  partial: boolean;
  results: FanOutActivationResult[];
}

export interface FanOutActivationResult {
  activationId: string;
  key: string;
  index: number;
  status: StepActivationStatus;
  variables?: Record<string, unknown>;
  summary?: string;
  error?: string;
}

/**
 * The loop-variable name the aggregate is recorded under, derived from the
 * source collection (e.g. "scoutAreas" → "scoutAreasResults"). Deterministic so
 * plan instructions and downstream steps can reference it.
 */
export function fanOutResultsVariable(fanOut: Pick<FanOutDefinition, 'itemsFrom'>): string {
  return `${fanOut.itemsFrom}Results`;
}
