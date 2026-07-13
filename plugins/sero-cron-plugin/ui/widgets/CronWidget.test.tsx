// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CRON_STATE } from '../../shared/types';
import { CronWidget } from './CronWidget';

const useAppStateMock = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => useAppStateMock(),
}));

vi.mock('../styles.css', () => ({ default: '' }));

describe('CronWidget', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    container.remove();
    root = null;
    vi.clearAllMocks();
  });

  it('handles legacy state snapshots without reminders safely', async () => {
    const legacyState = {
      ...DEFAULT_CRON_STATE,
      jobs: [],
      lastRunResults: [],
      schedulerActive: false,
    };
    Reflect.deleteProperty(legacyState, 'reminders');
    useAppStateMock.mockReturnValue([legacyState, vi.fn()]);

    await act(async () => {
      root?.render(<CronWidget />);
    });

    expect(container.textContent).toContain('Scheduler paused');
    expect(container.textContent).toContain('No scheduled tasks');
  });

  it('renders enabled jobs and active reminders from app state', async () => {
    useAppStateMock.mockReturnValue([
      {
        ...DEFAULT_CRON_STATE,
        schedulerActive: true,
        jobs: [
          {
            name: 'Daily report',
            schedule: '0 9 * * *',
            prompt: 'Generate the daily report',
            channel: 'cron',
            disabled: false,
          },
        ],
        reminders: [
          {
            id: 'rem-1',
            title: 'Stretch',
            channel: 'notification',
            type: 'once',
            fireAt: '2099-04-14T12:30:00.000Z',
            status: 'active',
            createdAt: '2026-04-14T12:00:00.000Z',
          },
        ],
      },
      vi.fn(),
    ]);

    await act(async () => {
      root?.render(<CronWidget />);
    });

    expect(container.textContent).toContain('Scheduler active');
    expect(container.textContent).toContain('Jobs1');
    expect(container.textContent).toContain('Reminders1');
    expect(container.textContent).toContain('Daily report');
    expect(container.textContent).toContain('Stretch');
  });
});
