import { describe, expect, it } from 'vitest';
import type { Loop } from '../../shared/types';
import { deliveryChip, receiptDisplay } from '../lib/delivery-summary';

function loopWith(overrides: Partial<Loop>): Loop {
  return { workspace: { useManagedWorktree: true }, ...overrides } as unknown as Loop;
}

describe('deliveryChip', () => {
  it('marks a derived destination as automatic and follows placement', () => {
    expect(deliveryChip(loopWith({}))).toMatchObject({ label: 'Pull request (auto)' });
    expect(deliveryChip(loopWith({ workspace: { useManagedWorktree: false } as Loop['workspace'] })).label).toBe(
      'Workspace files (auto)',
    );
  });

  it('shows the chosen destination with params in the hover title', () => {
    const chip = deliveryChip(loopWith({ delivery: { destination: 'chat-post', params: { channel: '#intel' } } }));
    expect(chip.label).toBe('Chat post');
    expect(chip.title).toContain('channel: #intel');
  });
});

describe('receiptDisplay', () => {
  it('links URL refs and titles them with the summary + ref', () => {
    const display = receiptDisplay({
      destination: 'pr', ref: 'https://github.com/o/r/pull/7', summary: 'Opened the fix PR', deliveredAt: 't',
    });
    expect(display).toEqual({
      label: 'Pull request',
      href: 'https://github.com/o/r/pull/7',
      title: 'Opened the fix PR — https://github.com/o/r/pull/7',
    });
  });

  it('renders non-URL refs (paths, draft ids) as plain text', () => {
    const display = receiptDisplay({
      destination: 'saved-artifact', ref: 'reports/digest.md', summary: 'Saved the digest', deliveredAt: 't',
    });
    expect(display.href).toBeUndefined();
    expect(display.label).toBe('Saved report');
    expect(display.title).toContain('reports/digest.md');
  });

  it('does not treat a ref with a URL plus trailing detail as a link', () => {
    const display = receiptDisplay({
      destination: 'webhook-post', ref: 'POST https://x.test/hook → 200', summary: 'Posted', deliveredAt: 't',
    });
    expect(display.href).toBeUndefined();
  });
});
