import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showNotification } from '@electron/platform/desktop/notifications';

const electron = vi.hoisted(() => {
  const { EventEmitter } = require('events') as typeof import('events');

  class FakeNotification extends EventEmitter {
    shown = false;

    constructor(public readonly options: Record<string, unknown>) {
      super();
      instances.push(this);
    }

    show(): void {
      this.shown = true;
    }

    static isSupported(): boolean {
      return true;
    }
  }

  const instances: FakeNotification[] = [];
  return { FakeNotification, instances };
});

vi.mock('electron', () => ({
  Notification: electron.FakeNotification,
  BrowserWindow: { getAllWindows: () => [] },
}));

describe('showNotification', () => {
  beforeEach(() => {
    electron.instances.length = 0;
  });

  it('takes the user somewhere when the notification asks them for something', () => {
    const onClick = vi.fn();
    showNotification({ message: 'Implementer needs you.', type: 'warning', subtitle: 'Ship the fix', onClick });

    const notification = electron.instances.at(-1);
    expect(notification?.options.subtitle).toBe('Ship the fix');
    expect(notification?.shown).toBe(true);

    notification?.emit('click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a notification that has nowhere to go', () => {
    showNotification({ message: 'A loop finished.' });
    expect(electron.instances.at(-1)?.shown).toBe(true);
  });
});
