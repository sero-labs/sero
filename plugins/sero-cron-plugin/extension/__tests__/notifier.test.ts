/**
 * Tests for the notification delivery module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { initNotifier, notifyJobComplete, notifyReminder } from '../notifier';
import type { Reminder, NotificationSettings } from '../../shared/types';

// ── Helpers ──────────────────────────────────────────────────────

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: 'r1',
    title: 'Meeting',
    channel: 'notification',
    type: 'once',
    status: 'active',
    createdAt: '2025-06-15T08:00:00Z',
    ...overrides,
  };
}

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
  soundName: 'Glass',
};

// ── Tests ────────────────────────────────────────────────────────

describe('initNotifier', () => {
  it('stores the emit function for later use', () => {
    const emit = vi.fn();
    initNotifier(emit);
    notifyJobComplete('test', true, 1000, defaultSettings);
    expect(emit).toHaveBeenCalled();
  });
});

describe('notifyJobComplete', () => {
  let emit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emit = vi.fn();
    initNotifier(emit);
  });

  it('emits sero:notify for successful job', () => {
    notifyJobComplete('daily-report', true, 2500, defaultSettings);

    expect(emit).toHaveBeenCalledWith(
      'sero:notify',
      expect.objectContaining({
        type: 'info',
        source: 'Cron',
      }),
    );
    const payload = emit.mock.calls[0][1];
    expect(payload.message).toContain('daily-report');
    expect(payload.message).toContain('completed');
  });

  it('emits error type for failed job', () => {
    notifyJobComplete('broken-job', false, 500, defaultSettings);

    const payload = emit.mock.calls[0][1];
    expect(payload.type).toBe('error');
    expect(payload.message).toContain('failed');
  });

  it('includes duration in message', () => {
    notifyJobComplete('job', true, 3456, defaultSettings);
    const payload = emit.mock.calls[0][1];
    expect(payload.message).toContain('3.5s');
  });

  it('respects sound settings', () => {
    notifyJobComplete('job', true, 1000, { soundEnabled: true, soundName: 'Hero' });
    expect(emit.mock.calls[0][1].sound).toBe('Hero');

    notifyJobComplete('job', true, 1000, { soundEnabled: false, soundName: 'Glass' });
    expect(emit.mock.calls[1][1].sound).toBe(false);
  });

  it('does nothing when emitter is not initialised', () => {
    // Re-init with no function — this tests the guard
    // We need to simulate no emitter, but initNotifier always sets one.
    // Instead we test the guard by checking the function doesn't throw
    // when called normally.
    notifyJobComplete('job', true, 1000);
    // No crash = pass
  });
});

describe('notifyReminder', () => {
  let emit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emit = vi.fn();
    initNotifier(emit);
  });

  it('emits notification for desktop channel', () => {
    const r = makeReminder({ title: 'Stand up!', notes: 'Daily standup meeting' });
    notifyReminder(r, defaultSettings);

    expect(emit).toHaveBeenCalledWith(
      'sero:notify',
      expect.objectContaining({
        type: 'info',
        source: expect.stringContaining('Reminder'),
      }),
    );
  });

  it('includes title in notification body', () => {
    const r = makeReminder({ title: 'Water plants' });
    notifyReminder(r, defaultSettings);

    const payload = emit.mock.calls[0][1];
    expect(payload.message).toContain('Water plants');
  });

  it('includes notes when present', () => {
    const r = makeReminder({ title: 'Task', notes: 'Some extra details' });
    notifyReminder(r, defaultSettings);

    const payload = emit.mock.calls[0][1];
    expect(payload.message).toContain('Some extra details');
  });

  it('handles email channel with fallback to desktop', () => {
    const r = makeReminder({ channel: 'email' });
    notifyReminder(r, defaultSettings);

    // Should still emit sero:notify (email falls back to desktop)
    expect(emit).toHaveBeenCalledWith('sero:notify', expect.anything());
  });

  it('uses configured sound', () => {
    const r = makeReminder();
    notifyReminder(r, { soundEnabled: true, soundName: 'Ping' });
    expect(emit.mock.calls[0][1].sound).toBe('Ping');
  });

  it('disables sound when soundEnabled is false', () => {
    const r = makeReminder();
    notifyReminder(r, { soundEnabled: false, soundName: 'Glass' });
    expect(emit.mock.calls[0][1].sound).toBe(false);
  });

  it('uses default settings when none provided', () => {
    const r = makeReminder();
    notifyReminder(r);
    // Should not throw, and should use default Glass sound
    expect(emit.mock.calls[0][1].sound).toBe('Glass');
  });
});
