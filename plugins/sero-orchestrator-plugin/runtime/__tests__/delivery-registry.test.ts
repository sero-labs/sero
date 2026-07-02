import { describe, expect, it } from 'vitest';
import { DELIVERY_DESTINATION_IDS, isExternalDestination } from '../../shared/delivery-types';
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

describe('formatDeliveryContract', () => {
  it('demands a receipt with the destination receipt hint', () => {
    const text = formatDeliveryContract({ destination: 'chat-post' });
    expect(text).toContain('PROOF OF DELIVERY');
    expect(text).toContain('"receipt"');
    expect(text).toContain('"destination": "chat-post"');
    expect(text).toContain(deliverySpec('chat-post').receiptHint);
  });

  it('is empty for workspace-files (no receipt needed)', () => {
    expect(formatDeliveryContract({ destination: 'workspace-files' })).toBe('');
  });
});
