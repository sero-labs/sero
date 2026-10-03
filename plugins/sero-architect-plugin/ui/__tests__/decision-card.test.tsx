// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { DECISION, FIXTURES } from '../__preview__/fixture';
import { CharterCard, DecisionCard, MilestoneApprovalCard, NeedsYou } from '../components/NeedsYou';

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

describe('readable approval plans', () => {
  it('renders the brief and approval rules as Markdown without changing approval', async () => {
    const approveCharter = vi.fn(async () => ({ ok: false, text: 'Approval was refused.' }));
    const record = {
      ...FIXTURES.charter!,
      brief: '## Goal\n\nBuild a small synth.\n\n## Choices\n\n- Keep the $5 cap.\n- Use `AudioContext`.\n\n[Evidence](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext)',
      charter: { ...FIXTURES.charter!.charter!, capUsd: 5, escalationPolicy: '- Ask before external delivery.\n- Ask before spending more than $5.' },
    };
    act(() => root.render(<CharterCard record={record} actions={{ answer: vi.fn(), approveCharter, approveMilestone: vi.fn() }} />));

    expect([...container.querySelectorAll('h2')].map((node) => node.textContent)).toEqual(['Goal', 'Choices']);
    expect(container.querySelector('code')?.textContent).toBe('AudioContext');
    expect(container.textContent).toContain('Evidence');
    expect([...container.querySelectorAll('li')].map((node) => node.textContent)).toContain('Ask before spending more than $5.');
    expect(container.textContent).toContain('$5');

    const approve = [...container.querySelectorAll('button')].find((node) => node.textContent?.includes('Approve charter'))!;
    act(() => approve.click());
    await flush();
    expect(approveCharter).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Approval was refused.');
    expect(record.charter.approvedAt).toBeNull();
  });

  it('renders milestone steps and checks as Markdown', () => {
    const record = FIXTURES.charter!;
    const milestone = { ...record.milestones[0]!, plan: '## Steps\n\n1. Build the core.\n2. Run `pnpm test`.\n\n## Checks\n\n- All tests must pass.' };
    act(() => root.render(<MilestoneApprovalCard record={record} milestone={milestone} actions={{ answer: vi.fn(), approveCharter: vi.fn(), approveMilestone: vi.fn() }} />));
    expect(container.querySelector('ol')?.textContent).toContain('Run pnpm test.');
    expect(container.querySelector('ul')?.textContent).toContain('All tests must pass.');
  });
});

describe('the needs-you section', () => {
  it('is absent on a quiet build, and returns with its card when a decision opens', () => {
    // It used to say nothing three times: a heading, a "none" count and a card
    // reading "You have nothing to review."
    const actions = { answer: vi.fn(), approveCharter: vi.fn(), approveMilestone: vi.fn() };
    act(() => root.render(<NeedsYou record={FIXTURES.build!} actions={actions} />));
    expect(container.querySelector('.ar-sec-head')).toBeNull();
    expect(container.querySelector('.ar-decision')).toBeNull();
    expect(container.textContent).toBe('');

    act(() => root.render(<NeedsYou record={FIXTURES.decision!} actions={actions} />));
    expect(container.querySelector('.ar-decision')).not.toBeNull();
    expect(container.querySelector('.ar-sec-head .ar-n')?.textContent).toBe('1');
  });
});
