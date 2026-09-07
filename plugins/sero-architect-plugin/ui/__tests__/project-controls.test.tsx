// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { FIXTURES } from '../__preview__/fixture';
import { IntakeDialog } from '../components/IntakeDialog';
import { ControlsMenu } from '../components/TopBar';
import type { ActionOutcome, ArchitectActions } from '../lib/actions';
import { ProjectPage } from '../ProjectPage';

vi.mock('@sero-ai/ui', () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>{children}</button>
    ),
    DropdownMenu: pass,
    DropdownMenuContent: pass,
    DropdownMenuTrigger: pass,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({ children, onSelect, disabled }: { children: ReactNode; onSelect?: () => void; disabled?: boolean }) => (
      <button type="button" onClick={onSelect} disabled={disabled}>{children}</button>
    ),
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: pass,
    DialogDescription: pass,
    DialogHeader: pass,
    DialogTitle: pass,
  };
});

vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
}));

const OK: ActionOutcome = { ok: true, text: 'done' };

function stubActions(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async () => OK);
  return {
    create: ok(), pause: ok(), resume: ok(), stop: ok(), remove: ok(), raiseCap: ok(),
    setAutonomy: ok(), approveCharter: ok(), approveMilestone: ok(), answer: ok(), directive: ok(),
    ...overrides,
  };
}

const disclosures = { historyOpen: false, olderOpen: false, setHistoryOpen: vi.fn(), setOlderOpen: vi.fn() };

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

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

function renderPage(actions: ArchitectActions, onBack = vi.fn()) {
  act(() => root.render(
    <ProjectPage record={FIXTURES.build!} actions={actions} narrow disclosures={disclosures} onBack={onBack} confirm={() => true} />,
  ));
  return onBack;
}

describe('a refused control', () => {
  it('shows the refusal text instead of doing nothing', async () => {
    const pause = vi.fn(async () => ({ ok: false, text: 'The project is already stopped.' }));
    renderPage(stubActions({ pause }));

    act(() => button('Pause').click());
    await flush();

    expect(pause).toHaveBeenCalledWith(FIXTURES.build!.id);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('The project is already stopped.');
  });

  it('clears the refusal once a later control is accepted', async () => {
    const actions = stubActions({ pause: vi.fn(async () => ({ ok: false, text: 'refused' })) });
    renderPage(actions);

    act(() => button('Pause').click());
    await flush();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    act(() => button('Stop').click());
    await flush();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('deleting a project', () => {
  it('leaves the page, because the record file is gone', async () => {
    const onBack = renderPage(stubActions());

    act(() => button('Delete project').click());
    await flush();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('stays on the page and reports a refused delete', async () => {
    const remove = vi.fn(async () => ({ ok: false, text: 'The owner session is still running.' }));
    const onBack = renderPage(stubActions({ remove }));

    act(() => button('Delete project').click());
    await flush();

    expect(onBack).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('The owner session is still running.');
  });
});

describe('raising the cap', () => {
  it('sends the number typed into the inline field, with no window.prompt', async () => {
    const raiseCap = vi.fn(async () => OK);
    const prompt = vi.fn();
    vi.stubGlobal('prompt', prompt);
    renderPage(stubActions({ raiseCap }));

    act(() => button('Raise cap').click());
    expect(prompt).not.toHaveBeenCalled();

    const field = container.querySelector<HTMLInputElement>('#ar-raise-cap-in');
    if (!field) throw new Error('no cap field');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, '85');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { field.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(raiseCap).toHaveBeenCalledWith(FIXTURES.build!.id, 85);
    expect(container.querySelector('#ar-raise-cap-in')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('the pause and resume choice', () => {
  it('offers Resume only for a project the user paused', () => {
    const controls = {
      pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), raiseCap: vi.fn(),
      setAutonomy: vi.fn(), openSession: vi.fn(), remove: vi.fn(),
    };
    act(() => root.render(<ControlsMenu record={{ ...FIXTURES.build!, paused: true }} controls={controls} />));
    expect(container.textContent).toContain('Resume');

    // Blocked and limited projects are not paused: Resume would be refused, so Pause is offered.
    act(() => root.render(<ControlsMenu record={{ ...FIXTURES.limited!, paused: false }} controls={controls} />));
    expect(container.textContent).toContain('Pause');
    expect(container.textContent).not.toContain('Resume');
  });
});

describe('creating a project', () => {
  it('does not close itself on success, so only the caller navigates', async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn(async () => ({ ok: true, text: 'created', projectId: 'hollow-depths' }));
    act(() => root.render(<IntakeDialog open onClose={onClose} onCreate={onCreate} defaultFolder="~/Projects/x" />));

    const idea = container.querySelector<HTMLTextAreaElement>('#ar-idea');
    if (!idea) throw new Error('no idea field');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(idea, 'A roguelike');
      idea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { idea.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(onCreate).toHaveBeenCalledWith('A roguelike', '~/Projects/x');
    expect(onClose).not.toHaveBeenCalled();
  });
});
