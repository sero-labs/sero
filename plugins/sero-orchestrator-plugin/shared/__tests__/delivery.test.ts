import { describe, expect, it } from 'vitest';
import {
  DELIVERY_DESTINATION_IDS,
  DELIVERY_DESTINATIONS,
  deliveryDestinationInfo,
  effectiveDelivery,
  isDeliveryDestinationId,
  isExternalDestination,
} from '../delivery-types';

describe('delivery destination table', () => {
  it('covers every destination id exactly once', () => {
    expect(DELIVERY_DESTINATIONS.map((d) => d.id).sort()).toEqual([...DELIVERY_DESTINATION_IDS].sort());
  });

  it('marks exactly the externally visible destinations as external (v1 approval rule)', () => {
    const external = DELIVERY_DESTINATIONS.filter((d) => d.external).map((d) => d.id).sort();
    expect(external).toEqual(['chat-post', 'email-send', 'webhook-post']);
    expect(isExternalDestination('email-send')).toBe(true);
    expect(isExternalDestination('email-draft')).toBe(false);
    expect(isExternalDestination('pr')).toBe(false);
  });

  it('resolves info by id and rejects unknown ids', () => {
    expect(deliveryDestinationInfo('chat-post').label).toBe('Chat post');
    expect(isDeliveryDestinationId('pr')).toBe(true);
    expect(isDeliveryDestinationId('carrier-pigeon')).toBe(false);
    expect(isDeliveryDestinationId(undefined)).toBe(false);
  });
});

describe('effectiveDelivery', () => {
  it('derives pr for worktree loops and workspace-files for root loops (legacy behavior)', () => {
    expect(effectiveDelivery({ workspace: { useManagedWorktree: true } })).toEqual({ destination: 'pr' });
    expect(effectiveDelivery({ workspace: { useManagedWorktree: false } })).toEqual({ destination: 'workspace-files' });
  });

  it('an explicit setting wins over placement', () => {
    const delivery = { destination: 'chat-post' as const, params: { channel: '#market-intel' } };
    expect(effectiveDelivery({ delivery, workspace: { useManagedWorktree: true } })).toBe(delivery);
  });

  it('tracks a later placement change while the user has not chosen', () => {
    const loop = { workspace: { useManagedWorktree: true } };
    expect(effectiveDelivery(loop).destination).toBe('pr');
    loop.workspace.useManagedWorktree = false;
    expect(effectiveDelivery(loop).destination).toBe('workspace-files');
  });
});
