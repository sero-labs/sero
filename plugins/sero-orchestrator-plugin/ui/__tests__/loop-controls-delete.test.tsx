// @vitest-environment jsdom

/**
 * Delete is not beside Run again.
 *
 * The captured page put seven equal buttons in one row, with Delete second, so
 * the control that destroys a Workflow had the same weight as the one that
 * runs it. It is in More actions now, and it still asks first.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Loop, LoopStatus, OrchestratorAction } from '../../shared/types';
import { LoopControls } from '../components/LoopControls';

function workflow(status: LoopStatus): Loop {
  return {
    id: 'loop-1',
    status,
    runtime: { workspace: { resolved: null } },
  } as unknown as Loop;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  // jsdom has no pointer capture, which the menu asks about before it opens.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function render(status: LoopStatus, onAction: (action: OrchestratorAction) => void = () => {}) {
  act(() => { root.render(<LoopControls loop={workflow(status)} busy={false} onAction={onAction} />); });
}

describe('the Workflow controls', () => {
  it('leaves Run again the only button beside More actions, and last', () => {
    render('complete');
    const buttons = [...host.querySelectorAll('button')];
    const labels = buttons.map((button) => button.textContent?.trim() || button.getAttribute('aria-label'));
    expect(labels).toEqual(['More actions', 'Run again']);
    expect(host.textContent).not.toContain('Delete');
  });

  it('offers Delete from More actions, and still asks before it deletes', () => {
    const onAction = vi.fn();
    render('complete', onAction);
    const more = host.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
    expect(more).not.toBeNull();
    act(() => {
      more?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });

    const item = [...document.querySelectorAll('[role="menuitem"]')]
      .find((node) => node.textContent?.includes('Delete Workflow'));
    expect(item).toBeDefined();
    act(() => { (item as HTMLElement).click(); });

    expect(host.textContent).toContain('Delete this Workflow and its settings?');
    expect(onAction).not.toHaveBeenCalled();

    const confirm = [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Confirm delete'));
    act(() => { confirm?.click(); });
    expect(onAction).toHaveBeenCalledWith({ kind: 'delete', loopId: 'loop-1', deleteBranch: false });
  });
});
