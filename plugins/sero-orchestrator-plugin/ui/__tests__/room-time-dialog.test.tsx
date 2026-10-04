// @vitest-environment jsdom

/**
 * Recovering a Room that used all its active time: one separate dialog, a
 * larger total that is enough, the same Room, and no spend change.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomHoldCard } from '../components/RoomHoldCard';
import { RoomTimeDialog } from '../components/RoomTimeDialog';
import { minutesToExceed } from '../lib/room-time';
import { addRoomTime, shownStopReason, type ResumeOutcome } from '../lib/room-controls';

const AT = '2026-09-11T09:00:00.000Z';
const TIME = { title: 'Build the synth', usedMs: 30 * 60_000, limitMs: 30 * 60_000, maxCostUsd: 2 };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const totalInput = () => document.body.querySelector<HTMLInputElement>('input[type="number"]')!;
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === label);

async function typeTotal(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(totalInput(), value);
    totalInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderDialog(onApprove: (total: number) => Promise<ResumeOutcome>, onClose = () => {}) {
  await act(async () => root.render(<RoomTimeDialog time={TIME} onApprove={onApprove} onClose={onClose} />));
}

describe('the minimum total', () => {
  it('is more than the limit, and more than the time used when that is more', () => {
    expect(minutesToExceed({ usedMs: 30 * 60_000, limitMs: 30 * 60_000 })).toBe(30);
    expect(minutesToExceed({ usedMs: 35 * 60_000, limitMs: 15 * 60_000 })).toBe(35);
  });
});

describe('the Add time dialog', () => {
  it('shows what was used, the limit and the unchanged spend cap, with a larger default total', async () => {
    await renderDialog(async () => ({ ok: true }));

    const text = dialog()?.textContent ?? '';
    expect(text).toContain('Add time to Build the synth');
    expect(text).toContain('30 min');
    expect(text).toContain('$2.00');
    expect(text).toContain('Not changed');
    expect(Number(totalInput().value)).toBeGreaterThan(30);
    expect(button('Approve and resume')?.disabled).toBe(false);
  });

  it.each(['', '30', '12', '30.5'])('cannot approve a total that is not enough (%s)', async (value) => {
    const onApprove = vi.fn(async (): Promise<ResumeOutcome> => ({ ok: true }));
    await renderDialog(onApprove);

    await typeTotal(value);

    expect(button('Approve and resume')?.disabled).toBe(true);
    expect(dialog()?.textContent).toContain('Enter a total of more than 30 minutes.');
    await act(async () => totalInput().form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('approves a larger total once and closes', async () => {
    const onApprove = vi.fn(async (): Promise<ResumeOutcome> => ({ ok: true }));
    const onClose = vi.fn();
    await renderDialog(onApprove, onClose);

    await typeTotal('45');
    await act(async () => button('Approve and resume')?.click());

    expect(onApprove).toHaveBeenCalledExactlyOnceWith(45);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays open and shows the tool\'s reason when the Room cannot resume', async () => {
    const onClose = vi.fn();
    await renderDialog(async () => ({ ok: false, error: 'Room is already completed.' }), onClose);

    await act(async () => button('Approve and resume')?.click());

    expect(dialog()?.textContent).toContain('Room is already completed.');
    expect(onClose).not.toHaveBeenCalled();
    expect(button('Approve and resume')?.disabled).toBe(false);
  });

  it('is busy while the Room resumes, and cannot be approved twice', async () => {
    let finish: (outcome: ResumeOutcome) => void = () => {};
    const onApprove = vi.fn(() => new Promise<ResumeOutcome>((resolve) => { finish = resolve; }));
    await renderDialog(onApprove);

    await act(async () => button('Approve and resume')?.click());
    expect(button('Approve and resume')?.disabled).toBe(true);
    expect(totalInput().disabled).toBe(true);
    await act(async () => button('Approve and resume')?.click());
    expect(onApprove).toHaveBeenCalledOnce();

    await act(async () => finish({ ok: true }));
  });

  it('closes on Cancel without resuming', async () => {
    const onApprove = vi.fn(async (): Promise<ResumeOutcome> => ({ ok: true }));
    const onClose = vi.fn();
    await renderDialog(onApprove, onClose);

    await act(async () => button('Cancel')?.click());

    expect(onClose).toHaveBeenCalledOnce();
    expect(onApprove).not.toHaveBeenCalled();
  });
});

describe('the hold', () => {
  it('opens the dialog from one Add time button and approves into the same resume', async () => {
    const onAddTime = vi.fn(async (): Promise<ResumeOutcome> => ({ ok: true }));
    await act(async () => root.render(
      <RoomHoldCard
        stopReason={{ kind: 'limit-reached', detail: 'Time limit reached.', at: AT }}
        members={[]}
        controls={{ message: true, resume: true, stop: true }}
        busy={false}
        onMessage={() => {}}
        onResume={() => {}}
        onStop={() => {}}
        time={TIME}
        onAddTime={onAddTime}
      />,
    ));
    expect(dialog()).toBeNull();

    await act(async () => button('Add time…')?.click());
    expect(dialog()?.textContent).toContain('Add time to Build the synth');
    await typeTotal('60');
    await act(async () => button('Approve and resume')?.click());

    expect(onAddTime).toHaveBeenCalledExactlyOnceWith(60);
    expect(dialog()).toBeNull();
  });
});

describe('resuming with a larger total', () => {
  it('names the same Room and the new total and nothing else, so spend cannot change', async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));

    const outcome = await addRoomTime(dispatch, 'room-7')(45);

    expect(outcome).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ action: 'resume', roomId: 'room-7', maxMinutes: 45 });
  });

  it('keeps the tool\'s own error text, and says something when it gave none', async () => {
    expect(await addRoomTime(async () => ({ ok: false, error: 'Room is already completed.' }), 'room-7')(45))
      .toEqual({ ok: false, error: 'Room is already completed.' });
    expect(await addRoomTime(async () => null, 'room-7')(45))
      .toEqual({ ok: false, error: 'The Room could not be resumed.' });
  });
});

describe('a Room that completed while pausing', () => {
  const reason = { kind: 'user-paused' as const, detail: 'Paused.', at: AT };

  it('shows no hold, so it cannot be resumed', () => {
    expect(shownStopReason({ status: 'completed', stopReason: reason })).toBeNull();
    expect(shownStopReason({ status: 'paused', stopReason: reason })).toBe(reason);
  });
});
