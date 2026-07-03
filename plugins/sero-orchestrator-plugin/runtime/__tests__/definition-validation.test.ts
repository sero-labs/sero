import { describe, expect, it } from 'vitest';
import type { LoopPlan, SharedLoopDefinition } from '../../shared/types';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY } from '../../shared/defaults';
import { validateSharedDefinition, validateTriggerConfig } from '../definition-validation';

function onePlan(): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'o',
    steps: [{ id: 'step-1', title: 'Do', instructions: 'Do it.', execution: { type: 'background-agent' } }],
  };
}

function gatedPlan(): LoopPlan {
  return {
    schemaVersion: 1,
    revision: 0,
    objective: 'send it',
    steps: [
      { id: 'gate', title: 'Approve', instructions: 'Ask.', gate: 'approval', execution: { type: 'background-agent' } },
      { id: 'send', title: 'Send', instructions: 'POST.', dependsOn: ['gate'], execution: { type: 'background-agent' } },
    ],
  };
}

function definition(overrides: Partial<SharedLoopDefinition> = {}): SharedLoopDefinition {
  return {
    schemaVersion: 1,
    prompt: 'p',
    title: 't',
    summary: 's',
    plan: onePlan(),
    triggers: [{ type: 'cron', schedule: '0 8 * * 1-5' }],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    ...overrides,
  };
}

describe('validateTriggerConfig', () => {
  it('accepts the four known types with sound halves', () => {
    expect(validateTriggerConfig({ type: 'manual' }, 't')).toEqual([]);
    expect(validateTriggerConfig({ type: 'cron', schedule: '*/15 * * * *' }, 't')).toEqual([]);
    expect(validateTriggerConfig({ type: 'event', eventSource: 'fs:changed', debounceMs: 900000 }, 't')).toEqual([]);
    expect(validateTriggerConfig({ type: 'hybrid', schedule: '30 7 * * *', eventSource: 'fs:changed' }, 't')).toEqual([]);
  });

  it('rejects an unknown type outright', () => {
    const errors = validateTriggerConfig({ type: 'sometimes' as never }, 'triggers[0]');
    expect(errors.join(' ')).toContain('unknown trigger type');
  });

  it('rejects a cron/hybrid trigger without a valid 5-field schedule', () => {
    expect(validateTriggerConfig({ type: 'cron', schedule: 'every morning' }, 't').join(' ')).toContain('cron');
    expect(validateTriggerConfig({ type: 'hybrid', eventSource: 'fs:changed' }, 't').join(' ')).toContain('schedule');
  });

  it('rejects an event trigger with an unknown source, bad filter, or negative debounce', () => {
    expect(validateTriggerConfig({ type: 'event', eventSource: 'carrier-pigeon:arrived' }, 't').join(' ')).toContain('eventSource');
    expect(validateTriggerConfig({ type: 'event' }, 't').join(' ')).toContain('eventSource');
    expect(validateTriggerConfig({ type: 'event', eventSource: 'fs:changed', eventFilter: { nested: { deep: true } } }, 't').join(' ')).toContain('eventFilter');
    expect(validateTriggerConfig({ type: 'event', eventSource: 'fs:changed', debounceMs: -5 }, 't').join(' ')).toContain('debounceMs');
  });

  it('rejects a non-positive or fractional maxFires', () => {
    expect(validateTriggerConfig({ type: 'manual', maxFires: 0 }, 't').join(' ')).toContain('maxFires');
    expect(validateTriggerConfig({ type: 'manual', maxFires: 1.5 }, 't').join(' ')).toContain('maxFires');
    expect(validateTriggerConfig({ type: 'manual', maxFires: 3 }, 't')).toEqual([]);
  });
});

describe('validateSharedDefinition', () => {
  it('passes a sound definition', () => {
    expect(validateSharedDefinition(definition())).toEqual([]);
  });

  it('reports a malformed root instead of throwing', () => {
    expect(validateSharedDefinition(null)[0]).toContain('JSON object');
    expect(validateSharedDefinition('a string')[0]).toContain('JSON object');
    expect(validateSharedDefinition(42)[0]).toContain('JSON object');
  });

  it('reports a missing/malformed plan instead of throwing', () => {
    const noPlan = { ...definition() } as Record<string, unknown>;
    delete noPlan.plan;
    expect(validateSharedDefinition(noPlan).join(' ')).toContain('definition.plan');
    expect(validateSharedDefinition({ ...definition(), plan: 'later' }).join(' ')).toContain('definition.plan');
  });

  it('reports malformed triggers instead of throwing', () => {
    const noTriggers = { ...definition() } as Record<string, unknown>;
    delete noTriggers.triggers;
    expect(validateSharedDefinition(noTriggers).join(' ')).toContain('definition.triggers');
    expect(validateSharedDefinition({ ...definition(), triggers: 'daily' }).join(' ')).toContain('definition.triggers');
    const nullEntry = validateSharedDefinition({ ...definition(), triggers: [null] });
    expect(nullEntry.join(' ')).toContain('triggers[0]');
    expect(nullEntry.join(' ')).toContain('must be an object');
  });

  it('reports a wrong schemaVersion and a missing prompt/title', () => {
    const errors = validateSharedDefinition({ ...definition(), schemaVersion: 2, prompt: '', title: undefined });
    expect(errors.join(' ')).toContain('schemaVersion');
    expect(errors.join(' ')).toContain('definition.prompt');
    expect(errors.join(' ')).toContain('definition.title');
  });

  it('reports plan errors', () => {
    const def = definition({ plan: { ...onePlan(), steps: [] } });
    expect(validateSharedDefinition(def).join(' ')).toContain('at least one step');
  });

  it('reports delivery errors', () => {
    const def = definition({ delivery: { destination: 'telegraph' as never } });
    expect(validateSharedDefinition(def).join(' ')).toContain('delivery.destination');
  });

  it('requires the approval gate for an external destination', () => {
    const external = definition({ delivery: { destination: 'webhook-post' } });
    expect(validateSharedDefinition(external).join(' ')).toContain('gate');
    const gated = definition({ plan: gatedPlan(), delivery: { destination: 'webhook-post' } });
    expect(validateSharedDefinition(gated)).toEqual([]);
  });

  it('reports every invalid trigger with its index', () => {
    const def = definition({
      triggers: [
        { type: 'cron', schedule: 'nope' },
        { type: 'event', eventSource: 'fs:changed' },
        { type: 'event', eventSource: 'ghost:kind' },
      ],
    });
    const errors = validateSharedDefinition(def);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('triggers[0]');
    expect(errors[1]).toContain('triggers[2]');
  });
});
