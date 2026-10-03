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

describe('the approval cards', () => {
  it('keeps the charter card to one line and sends the reader to the plan', async () => {
    const approveCharter = vi.fn(async () => ({ ok: false, text: 'Approval was refused.' }));
    const onOpenWork = vi.fn();
    const record = {
      ...FIXTURES.charter!,
      brief: '## Goal\n\nBuild a small synth.',
      charter: { ...FIXTURES.charter!.charter!, capUsd: 5, escalationPolicy: '- Ask before external delivery.' },
    };
    act(() => root.render(<CharterCard record={record} onOpenWork={onOpenWork} actions={{ answer: vi.fn(), approveCharter, approveMilestone: vi.fn() }} />));

    expect(container.textContent).toContain('Approve the charter');
    expect(container.textContent).toContain(`Cost cap $5 · ${record.charter.milestoneIds.length} milestones`);
    // The brief and the policy are read in Work, under Plan, not on the card.
    expect(container.textContent).not.toContain('Build a small synth.');
    expect(container.textContent).not.toContain('Ask before external delivery.');

    act(() => [...container.querySelectorAll('button')].find((node) => node.textContent?.includes('Read the charter'))!.click());
    expect(onOpenWork).toHaveBeenCalledWith('plan');

    act(() => [...container.querySelectorAll('button')].find((node) => node.textContent?.includes('Approve charter'))!.click());
    await flush();
    expect(approveCharter).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Approval was refused.');
    expect(record.charter.approvedAt).toBeNull();
  });

  it('approves a milestone plan from a short card', async () => {
    const approveMilestone = vi.fn(async () => ({ ok: true, text: 'approved' }));
    const onOpenWork = vi.fn();
    const milestone = { ...FIXTURES.charter!.milestones[0]!, plan: '## Steps\n\n1. Build the core.' };
    act(() => root.render(<MilestoneApprovalCard milestone={milestone} onOpenWork={onOpenWork} actions={{ answer: vi.fn(), approveCharter: vi.fn(), approveMilestone }} />));

    expect(container.textContent).not.toContain('Build the core.');
    act(() => [...container.querySelectorAll('button')].find((node) => node.textContent?.includes('Read the plan'))!.click());
    expect(onOpenWork).toHaveBeenCalledWith('plan');
    act(() => [...container.querySelectorAll('button')].find((node) => node.textContent?.includes('Approve plan'))!.click());
    await flush();
    expect(approveMilestone).toHaveBeenCalledWith(milestone.id);
  });
});

describe('the needs-you cards', () => {
  it('render nothing on a quiet build, and a card when a decision opens', () => {
    const actions = { answer: vi.fn(), approveCharter: vi.fn(), approveMilestone: vi.fn() };
    act(() => root.render(<NeedsYou record={FIXTURES.build!} actions={actions} />));
    expect(container.textContent).toBe('');

    act(() => root.render(<NeedsYou record={FIXTURES.decision!} actions={actions} />));
    expect(container.querySelector('[aria-label="Decision"]')).not.toBeNull();
  });
});
