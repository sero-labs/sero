// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomDeleteButton } from '../components/RoomDeleteButton';

describe('RoomDeleteButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('requires confirmation and explains the retained Room data and worktree refusal', async () => {
    const onDelete = vi.fn();
    await act(async () => root.render(<RoomDeleteButton busy={false} onDelete={onDelete} />));

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Delete Room"]');
    expect(trigger).not.toBeNull();
    expect(document.body.textContent).not.toContain('Delete this Room?');

    await act(async () => trigger?.click());
    expect(document.body.textContent).toContain('Delete this Room?');
    expect(document.body.textContent).toContain('persistent member session history');
    expect(document.body.textContent).toContain('worktree cannot be preserved');
    expect(onDelete).not.toHaveBeenCalled();

    const cancel = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Cancel');
    await act(async () => cancel?.click());
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Delete this Room?');

    await act(async () => trigger?.click());
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Delete this Room?');

    await act(async () => trigger?.click());
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Delete Room');
    await act(async () => confirm?.click());
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
