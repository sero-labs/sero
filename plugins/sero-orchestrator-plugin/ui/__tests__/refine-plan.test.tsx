// @vitest-environment jsdom

/**
 * Refine has to say that it is working.
 *
 * A revision takes up to a minute and the plan above it keeps showing the old
 * steps the whole time. When the only feedback was a disabled button, two people
 * read the screen as frozen and killed a run that was working correctly.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefinePlan } from '../components/RefinePlan';

describe('RefinePlan', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: { busy: boolean; planRevision: number; onRefine: (prompt: string) => void }) => {
    await act(async () => root.render(<RefinePlan {...props} />));
  };
  const text = () => container.textContent ?? '';
  const box = () => container.querySelector('textarea') as HTMLTextAreaElement;
  const button = () => container.querySelector('button') as HTMLButtonElement;

  const type = async (value: string) => {
    const field = box();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

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

  it('says it is working, and keeps the request until the plan changes', async () => {
    const onRefine = vi.fn();
    await render({ busy: false, planRevision: 3, onRefine });
    await type('Add an approval gate before the solver is changed.');
    await act(async () => button().click());

    expect(onRefine).toHaveBeenCalledWith('Add an approval gate before the solver is changed.');
    // Immediately, before the parent has even reported itself busy.
    expect(text()).toContain('The AI is rewriting the plan');
    expect(box().value).toContain('approval gate');

    await render({ busy: true, planRevision: 3, onRefine });
    expect(text()).toContain('The AI is rewriting the plan');

    await render({ busy: false, planRevision: 4, onRefine });
    expect(text()).toContain('Plan updated');
    expect(box().value).toBe('');
  });

  it('keeps the typed request when the revision ends without changing the plan', async () => {
    const onRefine = vi.fn();
    await render({ busy: false, planRevision: 3, onRefine });
    await type('Make it loop back on failure.');
    await act(async () => button().click());

    await render({ busy: true, planRevision: 3, onRefine });
    await render({ busy: false, planRevision: 3, onRefine });

    expect(text()).toContain('The plan did not change');
    expect(box().value).toBe('Make it loop back on failure.');
  });
});
