// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { DECISION, FIXTURES } from '../__preview__/fixture';
import { DecisionCard, NeedsYou } from '../components/NeedsYou';

vi.mock('@sero-ai/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await Promise.resolve(); });

describe('the decision card', () => {
  it('preselects the recommendation, so answering is one action', async () => {
    const answer = vi.fn(async () => ({ ok: true, text: 'answered' }));
    const actions = { answer, approveCharter: vi.fn(), approveMilestone: vi.fn() };
    act(() => root.render(<DecisionCard decision={DECISION} record={FIXTURES.decision!} actions={actions} />));

    const checked = container.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked?.value).toBe('canvas');
    expect(container.querySelector('.ar-rec')?.textContent).toContain('Recommended');

    act(() => container.querySelector<HTMLButtonElement>('.ar-dfoot button')!.click());
    await flush();
    expect(answer).toHaveBeenCalledWith('d7', 'canvas', '');
  });

  it('sends the chosen option and the note, and shows a refusal in place', async () => {
    const answer = vi.fn(async () => ({ ok: false, text: 'Decision d7 is already answered.' }));
    const actions = { answer, approveCharter: vi.fn(), approveMilestone: vi.fn() };
    act(() => root.render(<DecisionCard decision={DECISION} record={FIXTURES.decision!} actions={actions} />));

    const webgl = container.querySelector<HTMLInputElement>('input[value="webgl"]')!;
    act(() => { webgl.click(); });
    const note = container.querySelector<HTMLInputElement>('.ar-note-in')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(note, 'Fog matters for the demo.'); note.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => container.querySelector<HTMLButtonElement>('.ar-dfoot button')!.click());
    await flush();

    expect(answer).toHaveBeenCalledWith('d7', 'webgl', 'Fog matters for the demo.');
    expect(container.querySelector('.ar-error')?.textContent).toBe('Decision d7 is already answered.');
  });
});

describe('the needs-you section', () => {
  it('says nothing is needed on a quiet build and shows the card when a decision is open', () => {
    const actions = { answer: vi.fn(), approveCharter: vi.fn(), approveMilestone: vi.fn() };
    act(() => root.render(<NeedsYou record={FIXTURES.build!} actions={actions} />));
    expect(container.querySelector('.ar-quiet')?.textContent).toContain('Nothing is needed from you.');
    expect(container.querySelector('.ar-decision')).toBeNull();

    act(() => root.render(<NeedsYou record={FIXTURES.decision!} actions={actions} />));
    expect(container.querySelector('.ar-decision')).not.toBeNull();
    expect(container.querySelector('.ar-sec-head .ar-n')?.textContent).toBe('1');
  });
});
