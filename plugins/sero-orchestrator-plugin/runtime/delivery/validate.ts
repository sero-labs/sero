/**
 * Structural validation for delivery settings and the external-destination
 * plan shape. Split from schema.ts (500-LOC limit); schema.ts re-exports both
 * so existing imports keep resolving.
 */

import type { LoopDeliverySettings, LoopPlan } from '../../shared/types';
import { LOOP_DELIVERY_DESTINATION_IDS, isExternalDestination, isLoopDeliveryDestinationId } from '../../shared/delivery-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural validation for a loop's delivery setting: a known destination id
 * and a flat scalar params object. Mechanical only — what the params mean is
 * the agent's business at delivery time (see specs/13-pluggable-delivery.md).
 */
export function validateDeliverySettings(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['delivery must be an object { destination, params? }'];
  if (!isLoopDeliveryDestinationId(value.destination)) {
    errors.push(`delivery.destination must be one of: ${LOOP_DELIVERY_DESTINATION_IDS.join(', ')} — got ${JSON.stringify(value.destination)}`);
  }
  if (value.params !== undefined) {
    const flat =
      isRecord(value.params) &&
      Object.values(value.params).every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
    if (!flat) errors.push('delivery.params must be a flat object of string/number/boolean values');
  }
  return errors;
}

/**
 * Plan-shape requirement for externally visible destinations (spec 13, FR-D4):
 * the plan must stage the send behind a `gate: "approval"` step that the final
 * step (transitively) depends on. Empty for non-external destinations. With no
 * single sink (a shape plan validation rejects separately) this falls back to
 * gate-exists — in a valid single-sink plan every step is an ancestor of the
 * sink, so the ancestor walk only tightens odd shapes.
 */
export function approvalGateProblems(plan: LoopPlan, delivery: LoopDeliverySettings): string[] {
  if (!isExternalDestination(delivery.destination)) return [];
  const need = `destination "${delivery.destination}" is externally visible: the plan must contain a pre-final step with "gate": "approval" that presents the exact content for the user's decision, and the final step must (transitively) depend on it`;
  const dependedOn = new Set(plan.steps.flatMap((step) => step.dependsOn ?? []));
  const sinks = plan.steps.filter((step) => !dependedOn.has(step.id));
  if (sinks.length !== 1) {
    return plan.steps.some((s) => s.gate === 'approval') ? [] : [need];
  }
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const stack = [...(sinks[0].dependsOn ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = byId.get(id);
    if (step?.gate === 'approval') return [];
    stack.push(...(step?.dependsOn ?? []));
  }
  return [need];
}
