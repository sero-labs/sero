/**
 * Validation for a full SharedLoopDefinition — the shape that travels through
 * the Loop Library and Loop Catalog. Loading/installing/switching versions
 * must check MORE than the plan: a definition also carries delivery settings
 * (with the external approval-gate plan-shape rule) and triggers, and an
 * invalid cron or unknown event source would otherwise silently become a loop
 * that never fires (materializeTriggers does not validate). The input is
 * untrusted (a JSON file from a repo or on disk), so everything is guarded —
 * a malformed root, plan, or trigger entry returns a clean problem, never a
 * throw. Pure, so it unit-tests directly.
 */

import type { LoopPlan } from '../shared/types';
import { isDeliveryDestinationId } from '../shared/delivery-types';
import { isValidCron } from './cron';
import { approvalGateProblems, validateDeliverySettings, validateEventTriggerFields, validateLoopPlan } from './schema';
import { isRecord } from './structured-call';

const TRIGGER_TYPES: readonly string[] = ['manual', 'cron', 'event', 'hybrid'];

/**
 * Structural errors for one portable trigger config. Same rules the planner's
 * suggested triggers are held to (a cron/hybrid needs a valid 5-field
 * schedule, an event/hybrid a valid event half), plus the type itself — a
 * definition file is untrusted input, unlike an already-validated response.
 */
export function validateTriggerConfig(trigger: unknown, label: string): string[] {
  if (!isRecord(trigger)) return [`${label}: must be an object, got ${JSON.stringify(trigger)}.`];
  const errors: string[] = [];
  if (typeof trigger.type !== 'string' || !TRIGGER_TYPES.includes(trigger.type)) {
    errors.push(`${label}: unknown trigger type ${JSON.stringify(trigger.type)} — expected one of: ${TRIGGER_TYPES.join(', ')}.`);
    return errors;
  }
  if (trigger.type === 'cron' || trigger.type === 'hybrid') {
    if (typeof trigger.schedule !== 'string' || !isValidCron(trigger.schedule)) {
      errors.push(`${label}: a "${trigger.type}" trigger needs a valid 5-field cron "schedule" (minute hour day-of-month month day-of-week), got ${JSON.stringify(trigger.schedule)}.`);
    }
  }
  if (trigger.type === 'event' || trigger.type === 'hybrid') {
    validateEventTriggerFields(trigger, label, errors);
  }
  if (trigger.maxFires !== undefined && (typeof trigger.maxFires !== 'number' || !Number.isInteger(trigger.maxFires) || trigger.maxFires < 1)) {
    errors.push(`${label}: "maxFires" must be a positive integer, got ${JSON.stringify(trigger.maxFires)}.`);
  }
  return errors;
}

/**
 * Every structural problem in a shared definition ([] = loadable/installable):
 * root shape, the plan, the delivery settings, the external approval-gate plan
 * shape, and every trigger. Used by catalog install/update, library load, and
 * library version switching so nothing enters a workspace unvalidated.
 */
export function validateSharedDefinition(def: unknown): string[] {
  if (!isRecord(def)) return [`definition must be a JSON object, got ${JSON.stringify(def)}.`];
  const errors: string[] = [];
  if (def.schemaVersion !== 1) errors.push(`definition.schemaVersion must be 1, got ${JSON.stringify(def.schemaVersion)}.`);
  if (typeof def.prompt !== 'string' || !def.prompt.trim()) errors.push('definition.prompt must be a non-empty string.');
  if (typeof def.title !== 'string' || !def.title.trim()) errors.push('definition.title must be a non-empty string.');
  if (def.limits !== undefined && !isRecord(def.limits)) errors.push('definition.limits must be an object.');
  if (def.logPolicy !== undefined && !isRecord(def.logPolicy)) errors.push('definition.logPolicy must be an object.');
  if (def.contextOverrides !== undefined && !isRecord(def.contextOverrides)) errors.push('definition.contextOverrides must be an object.');

  const planErrors = isRecord(def.plan)
    ? validateLoopPlan(def.plan as unknown as LoopPlan)
    : ['definition.plan must be an object with a "steps" array.'];

  const deliveryErrors = def.delivery !== undefined ? validateDeliverySettings(def.delivery) : [];
  // The gate rule needs a sound plan and a known destination to inspect (it
  // only reads the destination, so params need not be threaded through).
  const gateErrors =
    isRecord(def.delivery) && isDeliveryDestinationId(def.delivery.destination) && planErrors.length === 0 && deliveryErrors.length === 0
      ? approvalGateProblems(def.plan as unknown as LoopPlan, { destination: def.delivery.destination })
      : [];

  const triggerErrors = Array.isArray(def.triggers)
    ? def.triggers.flatMap((t, i) => validateTriggerConfig(t, `triggers[${i}]`))
    : ['definition.triggers must be an array (use [] for none).'];

  return [...errors, ...planErrors, ...deliveryErrors, ...gateErrors, ...triggerErrors];
}
