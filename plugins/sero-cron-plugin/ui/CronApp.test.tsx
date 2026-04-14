// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CronState, Reminder } from '../shared/types';
import { DEFAULT_CRON_STATE } from '../shared/types';
import { CronApp } from './CronApp';

const promptMock = vi.fn();
const useAppStateMock = vi.fn();
let currentState: CronState = DEFAULT_CRON_STATE;

function applyStateUpdate(
  updater: CronState | ((state: CronState) => CronState),
): void {
  currentState = typeof updater === 'function' ? updater(currentState) : updater;
}

const updateStateMock = vi.fn((updater: CronState | ((state: CronState) => CronState)) => {
  applyStateUpdate(updater);
});

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => {
    const text = candidate.textContent?.trim() || candidate.getAttribute('aria-label') || '';
    return text.includes(label);
  });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function renderButton({
  children,
  onClick,
  ...props
}: {
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  size?: string;
  variant?: string;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={props.disabled} className={props.className}>
      {children}
    </button>
  );
}

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => useAppStateMock(),
  useAgentPrompt: () => promptMock,
}));

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: renderButton,
}));

vi.mock('@sero-ai/ui/components/ui/card', () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./styles.css', () => ({ default: '' }));

vi.mock('./components/SchedulerBar', () => ({
  SchedulerBar: ({ onToggle }: { onToggle: () => void }) => (
    <button onClick={onToggle}>Toggle scheduler</button>
  ),
}));

vi.mock('./components/ReminderList', () => ({
  ReminderList: ({
    reminders,
    onComplete,
  }: {
    reminders: Reminder[];
    onComplete: (id: string) => void;
  }) => (
    <div>
      <div>Reminder count: {reminders.length}</div>
      <button onClick={() => onComplete('rem-1')}>Complete reminder</button>
    </div>
  ),
}));

vi.mock('./components/JobsTab', () => ({
  JobsTab: ({ onRun }: { onRun: (name: string) => void }) => (
    <button onClick={() => onRun('daily-report')}>Run job</button>
  ),
}));

vi.mock('./components/JobForm', () => ({
  JobForm: () => null,
}));

vi.mock('./components/ReminderForm', () => ({
  ReminderForm: () => null,
}));

vi.mock('./components/RunHistory', () => ({
  RunHistory: () => <div>Run history</div>,
}));

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: 'rem-1',
    title: 'Stretch',
    channel: 'notification',
    type: 'once',
    fireAt: '2026-04-14T12:30:00.000Z',
    status: 'active',
    createdAt: '2026-04-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('CronApp', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    currentState = {
      ...DEFAULT_CRON_STATE,
      reminders: [makeReminder()],
      jobs: [
        {
          name: 'daily-report',
          schedule: '0 9 * * *',
          prompt: 'Generate the daily report',
          channel: 'cron',
          disabled: false,
        },
      ],
      lastRunResults: [
        {
          jobName: 'daily-report',
          startedAt: '2026-04-14T11:00:00.000Z',
          durationMs: 250,
          ok: true,
        },
      ],
    };
    promptMock.mockReset();
    updateStateMock.mockClear();
    useAppStateMock.mockImplementation(() => [currentState, updateStateMock]);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
    vi.clearAllMocks();
  });

  it('routes reminder completion through the shared updateState path', async () => {
    await act(async () => {
      root?.render(<CronApp />);
    });

    await act(async () => {
      clickButton(container, 'Complete reminder');
    });

    expect(updateStateMock).toHaveBeenCalledTimes(1);
    expect(currentState.reminders).toHaveLength(1);
    expect(currentState.reminders[0]?.status).toBe('completed');
    expect(currentState.reminders[0]?.completedAt).toBeTruthy();
  });

  it('uses agent prompts for scheduler toggles and job runs', async () => {
    await act(async () => {
      root?.render(<CronApp />);
    });

    await act(async () => {
      clickButton(container, 'Toggle scheduler');
    });

    expect(promptMock).toHaveBeenCalledWith('Start the cron scheduler using /cron on');

    await act(async () => {
      clickButton(container, 'Jobs (1)');
    });

    await act(async () => {
      clickButton(container, 'Run job');
    });

    expect(promptMock).toHaveBeenCalledWith(
      'Run the cron job "daily-report" immediately using the cron tool with action run.',
    );
  });
});
