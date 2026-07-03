/**
 * Validation for a full SharedLoopDefinition — the shape that travels through
 * the Loop Library and Loop Catalog. Loading/installing/switching versions
 * must check MORE than the plan: a definition also carries delivery settings
 * (with the external approval-gate plan-shape rule) and triggers, and an
 * invalid cron or unknown event source would otherwise silently become a loop
 * that never fires (materializeTriggers does not validate). Pure, so it
 * unit-tests directly.
 */

import type { SharedLoopDefinition, SharedTriggerConfig } from '../shared/types';
import { isValidCron } from './cron';
import { approvalGateProblems, validateDeliverySettings, validateEventTriggerFields, validateLoopPlan } from './schema';

const TRIGGER_TYPES: readonly SharedTriggerConfig['type'][] = ['manual', 'cron', 'event', 'hybrid'];

/**
 * Structural errors for one portable trigger config. Same rules the planner's
 * suggested triggers are held to (a cron/hybrid needs a valid 5-field
 * schedule, an event/hybrid a valid event half), plus the type itself — a
 * definition file is untrusted input, unlike an already-validated response.
 */
export function validateTriggerConfig(trigger: SharedTriggerConfig, label: string): string[] {
  const errors: string[] = [];
  if (!TRIGGER_TYPES.includes(trigger.type)) {
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
  if (trigger.maxFires !== undefined && (!Number.isInteger(trigger.maxFires) || trigger.maxFires < 1)) {
    errors.push(`${label}: "maxFires" must be a positive integer, got ${JSON.stringify(trigger.maxFires)}.`);
  }
  return errors;
}

/**
 * Every structural problem in a shared definition ([] = loadable/installable):
 * the plan, the delivery settings, the external approval-gate plan shape, and
 * every trigger. Used by catalog install/update, library load, and library
 * version switching so nothing enters a workspace unvalidated.
 */
export function validateSharedDefinition(def: SharedLoopDefinition): string[] {
  const planErrors = validateLoopPlan(def.plan);
  const deliveryErrors = def.delivery ? validateDeliverySettings(def.delivery) : [];
  // The gate rule needs a sound plan and a known destination to inspect.
  const gateErrors =
    def.delivery && planErrors.length === 0 && deliveryErrors.length === 0
      ? approvalGateProblems(def.plan, def.delivery)
      : [];
  const triggerErrors = (def.triggers ?? []).flatMap((t, i) => validateTriggerConfig(t, `triggers[${i}]`));
  return [...planErrors, ...deliveryErrors, ...gateErrors, ...triggerErrors];
}
