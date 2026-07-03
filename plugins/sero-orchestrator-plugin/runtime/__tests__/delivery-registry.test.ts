import { describe, expect, it } from 'vitest';
import type { Loop } from '../../shared/types';
import { DELIVERY_DESTINATION_IDS, isExternalDestination, missingDeliveryParams } from '../../shared/delivery-types';
import { deliverySpec } from '../delivery/registry';
import { formatDeliveryContract } from '../delivery/delivery-contract';

describe('delivery registry', () => {
  it('covers every destination with planner rules and a receipt hint', () => {
    for (const id of DELIVERY_DESTINATION_IDS) {
      const spec = deliverySpec(id);
      expect(spec.id).toBe(id);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.plannerRules.length).toBeGreaterThan(40);
      expect(spec.receiptHint.length).toBeGreaterThan(10);
    }
  });

  it('keeps external flags in lockstep with the shared table', () => {
    for (const id of DELIVERY_DESTINATION_IDS) {
      expect(deliverySpec(id).external).toBe(isExternalDestination(id));
    }
  });

  it('requires the right extra tools per destination', () => {
    expect(deliverySpec('chat-post').requiredTools).toEqual(['mcp']);
    expect(deliverySpec('email-draft').requiredTools).toEqual(['gmail']);
    expect(deliverySpec('email-send').requiredTools).toEqual(['gmail']);
    for (const id of ['pr', 'workspace-files', 'saved-artifact', 'webhook-post'] as const) {
      expect(deliverySpec(id).requiredTools).toEqual([]);
    }
  });

  it('stages every external destination behind user approval in its planner rules', () => {
    for (const id of DELIVERY_DESTINATION_IDS.filter(isExternalDestination)) {
      expect(deliverySpec(id).plannerRules).toContain('approval');
      expect(deliverySpec(id).plannerRules).toContain('HUMAN APPROVAL / INPUT GATES');
    }
  });
});

describe('missingDeliveryParams', () => {
  it('reports the url a webhook-post delivery cannot send without', () => {
    expect(missingDeliveryParams({ destination: 'webhook-post' })).toEqual(['url']);
    expect(missingDeliveryParams({ destination: 'webhook-post', params: { url: '   ' } })).toEqual(['url']);
    expect(missingDeliveryParams({ destination: 'webhook-post', params: { url: 'https://example.test/hook' } })).toEqual([]);
  });

  it('requires nothing for destinations whose params the agent can resolve', () => {
    for (const id of DELIVERY_DESTINATION_IDS.filter((d) => d !== 'webhook-post')) {
      expect(missingDeliveryParams({ destination: id })).toEqual([]);
    }
  });
});

describe('formatDeliveryContract', () => {
  const bareLoop = { plan: { steps: [] }, answeredInputs: [] } as unknown as Loop;

  it('demands a receipt with the destination receipt hint', () => {
    const text = formatDeliveryContract(bareLoop, { destination: 'chat-post' });
    expect(text).toContain('PROOF OF DELIVERY');
    expect(text).toContain('"receipt"');
    expect(text).toContain('"destination": "chat-post"');
    expect(text).toContain(deliverySpec('chat-post').receiptHint);
  });

  it('tells an external step with no open approval that nothing may ship yet', () => {
    const text = formatDeliveryContract(bareLoop, { destination: 'chat-post' });
    expect(text).toContain('EXTERNAL SEND AUTHORIZATION');
    expect(text).toContain('NOTHING may be delivered externally yet');
    expect(text).toContain('"approvalId"');
  });

  it('is empty for workspace-files (no receipt needed)', () => {
    expect(formatDeliveryContract(bareLoop, { destination: 'workspace-files' })).toBe('');
  });
});
