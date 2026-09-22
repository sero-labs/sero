// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { DECISION, FIXTURES } from '../__preview__/fixture';
import { StateLine } from '../components/StateLine';
import { IntakeDialog } from '../components/IntakeDialog';
import { ControlsMenu } from '../components/TopBar';
import type { ActionOutcome, ArchitectActions } from '../lib/actions';
import type { ProjectRecord } from '../../shared/record';
import { ProjectPage } from '../ProjectPage';

vi.mock('@sero-ai/ui', async () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  // The radio group and the disclosure are exercised for real: a stub that
  // answered every click could not tell a styled control from a native one.
  const actual = await vi.importActual<typeof import('@sero-ai/ui')>('@sero-ai/ui');
  return {
    RadioGroup: actual.RadioGroup,
    Switch: actual.Switch,
    RadioGroupItem: actual.RadioGroupItem,
    Collapsible: actual.Collapsible,
    CollapsibleTrigger: actual.CollapsibleTrigger,
    CollapsibleContent: actual.CollapsibleContent,
    Select: pass, SelectTrigger: pass, SelectValue: pass, SelectContent: pass, SelectItem: pass,
    Input: 'input',
    Textarea: 'textarea',
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
  useAppTools: () => ({ run: vi.fn(async () => ({ text: 'Preview ready', details: { ok: true, url: 'http://localhost:3000' } })) }),
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
  useAvailableModels: () => ({ groups: [{ provider: 'anthropic', displayName: 'Anthropic', logo: '', models: [{ provider: 'anthropic', modelId: 'claude-fable-5-1', name: 'Fable', reasoning: true, availableThinkingLevels: ['low', 'high'] }] }], loading: false, error: null, refresh: vi.fn() }),
}));

// The real disclosure measures its content; jsdom has no ResizeObserver.
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;

const OK: ActionOutcome = { ok: true, text: 'done' };

function stubActions(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async () => OK);
  return {
    create: ok(), history: vi.fn(async () => ({ ...OK, entries: [] })), trace: vi.fn(async () => ({ ...OK, page: null })), pause: ok(), resume: ok(), retry: ok(), stop: ok(), remove: ok(), raiseCap: ok(),
    setExecutionMode: ok(), setAutonomy: ok(), approveCharter: ok(), approveMilestone: ok(), answer: ok(), directive: ok(),
    setModelDefault: ok(), clearModelDefault: ok(), refreshModelTiers: ok(),
    ...overrides,
  };
}

const disclosures = { olderOpen: false, setOlderOpen: vi.fn(), folds: { opened: new Set<string>(), toggle: vi.fn() } };

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
    <ProjectPage runtimeRunning record={FIXTURES.build!} actions={actions} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={onBack} confirm={() => true} />,
  ));
  return onBack;
}

it('labels legacy cost as incomplete through the ring hint without changing the shown spend', () => {
  const base = FIXTURES.build!;
  const record = { ...base, budget: { ...base.budget, spentUsd: 12.34, incomplete: undefined } };
  act(() => root.render(<StateLine runtimeRunning record={record} home={null} />));
  expect(container.textContent).toContain('$12.34');
  // The spend line stays a spend line: no coverage wording is added to the page.
  expect(container.textContent).not.toContain('cost incomplete');
  const incomplete = container.querySelector('[role="img"]');
  expect(incomplete?.getAttribute('aria-label')).toContain('Cost incomplete.');
  expect(incomplete?.getAttribute('title')).toContain('lower bound');

  act(() => root.render(<StateLine runtimeRunning record={{ ...record, budget: { ...record.budget, incomplete: false } }} home={null} />));
  expect(container.textContent).toContain('$12.34');
  const complete = container.querySelector('[role="img"]');
  expect(complete?.getAttribute('aria-label')).not.toContain('Cost incomplete.');
  expect(complete?.getAttribute('title')).toBeNull();
});

describe('a refused control', () => {
  it('offers permission retry on an existing intake project and shows request errors', async () => {
    const resume = vi.fn(async () => ({ ok: false, text: 'Permission request was not answered.' }));
    const record = { ...FIXTURES.build!, phase: 'intake' as const, blockedReason: 'Permission not approved' };
    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions({ resume })} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));
    act(() => button('Request permission').click());
    await flush();
    expect(resume).toHaveBeenCalledWith(record.id);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Permission request was not answered.');
    expect(button('Request permission').disabled).toBe(false);
  });

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

describe('project history access', () => {
  it('keeps the directive composer outside the scrolling project content', () => {
    renderPage(stubActions());
    const scroll = container.querySelector('.ar-scroll');
    const composer = container.querySelector('.ar-composer');
    expect(scroll).not.toBeNull();
    expect(composer).not.toBeNull();
    expect(scroll?.contains(composer)).toBe(false);
    // History is its own view now; the page keeps only the older directives.
    expect(scroll?.querySelector('[data-testid="history"]')).toBeNull();
    expect(scroll?.querySelector('[data-testid="older-directives"]')).not.toBeNull();
  });

  it('keeps the older-directives disclosure in the narrow layout and drops History', () => {
    renderPage(stubActions());
    expect(container.querySelector('[data-testid="history"]')).toBeNull();
    expect(container.querySelector('[data-testid="older-directives"]')).not.toBeNull();
  });

  it('opens the owner transcript as read-only history instead of a raw file', async () => {
    const history = vi.fn(async () => ({
      ok: true,
      text: 'read',
      entries: [{ turnIndex: 1, timestamp: '2026-09-07T09:00:00.000Z', role: 'assistant' as const, text: 'I dispatched milestone one.' }],
    }));
    renderPage(stubActions({ history }));

    act(() => button('Open session').click());
    await flush();

    expect(history).toHaveBeenCalledWith(FIXTURES.build!.id);
    expect(container.textContent).toContain('I dispatched milestone one.');
    expect(container.textContent).toContain('Recent messages from the owner session.');
  });
});

it('sandboxes the project preview without granting same-origin access', async () => {
  renderPage(stubActions());
  act(() => button('Open preview').click());
  await flush();

  const preview = container.querySelector('iframe');
  expect(preview?.getAttribute('sandbox')).toBe('allow-forms allow-modals allow-popups allow-scripts');
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
    const record = { ...FIXTURES.build!, budget: { ...FIXTURES.build!.budget, capUsd: 0.5 } };
    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions({ raiseCap })} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    act(() => button('Raise cap').click());
    expect(prompt).not.toHaveBeenCalled();

    const field = container.querySelector<HTMLInputElement>('#ar-raise-cap-in');
    if (!field) throw new Error('no cap field');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, '85');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(field.checkValidity()).toBe(true);
    act(() => { field.form?.requestSubmit(); });
    await flush();

    expect(raiseCap).toHaveBeenCalledWith(FIXTURES.build!.id, 85);
    expect(container.querySelector('#ar-raise-cap-in')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('the pause and resume choice', () => {
  it('offers Resume for paused or blocked projects, and Pause for a cap alone', () => {
    const controls = {
      pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), raiseCap: vi.fn(),
      setExecutionMode: vi.fn(), setAutonomy: vi.fn(), openSession: vi.fn(), remove: vi.fn(), openModels: vi.fn(), openInspector: vi.fn(), openHistory: vi.fn(),
    };
    act(() => root.render(<ControlsMenu record={{ ...FIXTURES.build!, paused: true }} controls={controls} />));
    expect(container.textContent).toContain('Resume');

    act(() => root.render(<ControlsMenu record={{ ...FIXTURES.build!, paused: false, blockedReason: 'The delegated Room needs attention.' }} controls={controls} />));
    act(() => button('Resume').click());
    expect(controls.resume).toHaveBeenCalledOnce();
    expect(controls.pause).not.toHaveBeenCalled();

    // A cap alone is not a blocker that Resume can clear.
    act(() => root.render(<ControlsMenu record={{ ...FIXTURES.limited!, paused: false }} controls={controls} />));
    expect(container.textContent).toContain('Pause');
    expect(container.textContent).not.toContain('Resume');
  });

  it('offers History in the project controls menu and runs it', () => {
    const openHistory = vi.fn();
    const controls = {
      pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), raiseCap: vi.fn(),
      setExecutionMode: vi.fn(), setAutonomy: vi.fn(), openSession: vi.fn(), remove: vi.fn(), openModels: vi.fn(), openInspector: vi.fn(), openHistory,
    };
    act(() => root.render(<ControlsMenu record={FIXTURES.build!} controls={controls} />));

    act(() => button('History…').click());

    expect(openHistory).toHaveBeenCalledOnce();
  });
});

describe('creating a project', () => {
  it.each(['workspace', 'worktree'] as const)('submits %s placement before setup without navigating twice', async (executionMode) => {
    const onClose = vi.fn();
    const onCreate = vi.fn(async () => ({ ok: true, text: 'created', projectId: 'hollow-depths' }));
    act(() => root.render(<IntakeDialog open onClose={onClose} onCreate={onCreate} defaultFolder="~/Projects/x" />));

    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]');
    if (!toggle) throw new Error('no worktree switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    if (executionMode === 'worktree') act(() => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe(executionMode === 'worktree' ? 'true' : 'false');
    expect(container.textContent).not.toContain('Work directly in the project folder');
    const idea = container.querySelector<HTMLTextAreaElement>('#ar-idea');
    if (!idea) throw new Error('no idea field');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(idea, 'A roguelike');
      idea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      const name = container.querySelector<HTMLInputElement>('#ar-name')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'game');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { idea.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(onCreate).toHaveBeenCalledWith('A roguelike', '~/Projects/x/game', executionMode, []);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the model overrides folded until asked, then shows one row per tier', () => {
    act(() => root.render(<IntakeDialog open onClose={vi.fn()} onCreate={vi.fn(async () => OK)} defaultFolder="~/Projects/x" />));
    const trigger = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes('Model overrides'));
    if (!trigger) throw new Error('no overrides trigger');
    expect(container.querySelector('[aria-label="LOW model"]')).toBeNull();
    act(() => trigger.click());
    for (const tier of ['LOW', 'MED', 'HIGH']) expect(container.textContent).toContain(tier);
  });
});

describe('the top of a project', () => {
  /** A project whose milestone run stopped with a step to retry. */
  function stoppedProject() {
    const base = FIXTURES.build!;
    const first = base.milestones[0];
    return {
      ...base,
      stateLine: 'Milestone m2 stopped before it finished; the runtime must surface the concrete blocker.',
      milestones: [
        { ...first, dispatch: { ...first.dispatch!, failure: 'Interrupted work', retryStepId: 'check-release' } },
        ...base.milestones.slice(1),
      ],
    };
  }

  it('leads with the state in plain words and lifts Retry step into the header', async () => {
    const retry = vi.fn(async () => OK);
    const record = stoppedProject();

    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions({ retry })} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    const heading = container.querySelector('.ar-sentence');
    expect(heading?.textContent).toContain(`${record.milestones[0].title} stopped`);
    // The header's own retry, above the rail, starting the same retry.
    const headerRetry = container.querySelector('.ar-stateline button');
    expect(headerRetry?.textContent).toBe('Retry step');

    act(() => (headerRetry as HTMLButtonElement).click());
    await flush();

    expect(retry).toHaveBeenCalledWith(record.id, record.milestones[0].id);
  });

  it('puts the new-cap field beside the sentence when the spend cap stopped the project', () => {
    // The cap strip used to be the second card down, under a heading that said
    // nothing needed the user. Raising the cap needs a number, so the header
    // carries the field rather than a button that reveals one.
    const base = FIXTURES.limited!;
    const record = { ...base, budget: { ...base.budget, spentUsd: base.budget.capUsd ?? 0 } };

    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions()} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    const field = container.querySelector('.ar-stateline #ar-header-cap-in');
    expect(field).not.toBeNull();
    const submit = container.querySelector('.ar-stateline button') as HTMLButtonElement | null;
    expect(submit?.textContent).toBe('Raise and resume');
    expect(container.querySelector('.ar-limit')).toBeNull();
  });

  it('raises the cap through one action, whichever copy the user reaches', async () => {
    const base = FIXTURES.limited!;
    const record = { ...base, budget: { ...base.budget, spentUsd: base.budget.capUsd ?? 0 } };
    const raiseCap = vi.fn(async () => OK);

    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions({ raiseCap })} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    const form = container.querySelector('.ar-stateline form.ar-cap') as HTMLFormElement | null;
    expect(form).not.toBeNull();
    act(() => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(raiseCap).toHaveBeenCalledWith(record.id, expect.any(Number));
    // Raise cap is still in the project menu; the header copy is the one the
    // user reaches first.
    expect(container.querySelector('.ar-stateline #ar-header-cap-in')).not.toBeNull();
  });

  it('carries a Workflow cap resume in the header, whole', async () => {
    // The control used to live on the milestone row. It moves here complete:
    // its own field, its own wording, and the retry action with the new cap —
    // so a workflow-cap resume no longer depends on reaching the row.
    const base = FIXTURES.build!;
    const first = base.milestones[0];
    const record = {
      ...base,
      milestones: [
        { ...first, dispatch: { ...first.dispatch!, failure: 'reached max cost ($1.2)', costLimitUsd: 1.2 } },
        ...base.milestones.slice(1),
      ],
    };
    const retry = vi.fn(async () => OK);

    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions({ retry })} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    expect(container.querySelector('#ar-header-wf-cap-in')).not.toBeNull();
    const submit = container.querySelector('.ar-stateline form.ar-cap button') as HTMLButtonElement | null;
    expect(submit?.textContent).toBe('Approve cap and resume');

    const form = container.querySelector('.ar-stateline form.ar-cap') as HTMLFormElement | null;
    act(() => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(retry).toHaveBeenCalledWith(record.id, first.id, expect.any(Number));
  });

  it('says what stopped, and why, once', () => {
    const record = stoppedProject();

    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions()} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    const header = container.querySelector('.ar-stateline')!;
    // The cause rides the activity line beside the state glyph — one line, the
    // shape the drawing shows — and is not repeated as a second line below it.
    expect(header.querySelector('.ar-stateline-who')?.textContent).toContain('Interrupted work');
    expect(header.querySelector('.ar-stateline-why')).toBeNull();
    const occurrences = (header.textContent ?? '').split('Interrupted work').length - 1;
    expect(occurrences).toBe(1);
    // Nor is it filed as the Architect's own report, which is a different fact.
    expect(header.querySelector('.ar-reported')?.textContent).not.toContain('Interrupted work');
  });

  it('shows no header button when nothing needs the user', () => {
    act(() => root.render(
      <ProjectPage runtimeRunning record={FIXTURES.build!} actions={stubActions()} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    expect(container.querySelector('.ar-stateline button')).toBeNull();
  });

  it('keeps the Architect sentence complete behind a disclosure, and out of the heading', () => {
    const record = stoppedProject();

    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions()} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));

    const reported = container.querySelector('.ar-reported');
    expect(reported?.querySelector('summary')?.textContent).toContain('What Architect reported');
    expect(reported?.textContent).toContain(record.stateLine);
    expect(container.querySelector('.ar-sentence')?.textContent).not.toContain(record.stateLine);
  });
});

/**
 * A project stopped because its research Room ended without reporting. The
 * header names the Room, says why, and offers the two things there are to do.
 */
describe('a project stopped on delegated work', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const cancelledRoom = () => ({
    ...FIXTURES.build!,
    blockedReason: 'Research Room room_3240 is cancelled. Open the Room to review its next action.',
    blockedOn: {
      kind: 'room' as const,
      id: 'room_3240',
      title: 'Import Dashboard Discovery',
      status: 'cancelled',
      at: '2026-09-10T12:00:00.000Z',
      cause: { text: 'Its members had read-only access and could not run commands.', decisionId: 'dec-1' },
    },
  });

  const render = (record: ReturnType<typeof cancelledRoom>) => act(() => root.render(
    <ProjectPage runtimeRunning record={record} actions={stubActions()} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
  ));

  it('keeps the autonomy setting out of the header and in the project menu', () => {
    render(cancelledRoom());
    // The header says what stopped and what to do about it, nothing else. The
    // setting itself is a menu entry, checked in the controls-menu tests above.
    expect(container.querySelector('.ar-stateline')?.textContent).not.toContain('You approve each milestone plan');
    expect(container.querySelector('.ar-stateline')?.textContent).not.toContain('Autonomy');
  });

  it('names the Room and states the reason, instead of printing its id', () => {
    render(cancelledRoom());
    const header = container.querySelector('.ar-stateline')?.textContent ?? '';
    expect(header).toContain('Research was cancelled before it reported');
    expect(header).toContain('Import Dashboard Discovery');
    expect(header).toContain('Its members had read-only access and could not run commands.');
    expect(container.querySelector('.ar-sentence')?.textContent).not.toContain('room_3240');
  });

  it('offers opening the Room and telling the Architect what to do next', () => {
    render(cancelledRoom());
    const labels = [...container.querySelectorAll('.ar-stateline button')].map((node) => node.textContent);
    expect(labels).toEqual(['Open Room', 'Tell Architect what to do next']);
  });

  it('puts the cursor in the existing directive box rather than opening another', () => {
    render(cancelledRoom());
    const tell = [...container.querySelectorAll<HTMLButtonElement>('.ar-stateline button')]
      .find((node) => node.textContent === 'Tell Architect what to do next');
    const composers = container.querySelectorAll('textarea[aria-label="Directive"]');
    expect(composers).toHaveLength(1);

    act(() => tell?.click());
    expect(document.activeElement).toBe(composers[0]);
    // Still one box: the control is a way in, not a second way to send.
    expect(container.querySelectorAll('textarea[aria-label="Directive"]')).toHaveLength(1);
  });
});

/**
 * Each kind of nothing gets one quiet line where it belongs.
 *
 * The captured defects: "Needs you · none" was a heading, a label and a card
 * saying "You have nothing to review."; and milestones that did not exist yet
 * were a dashed card repeating what the header could say.
 */
describe('the kinds of nothing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const render = (record: ProjectRecord) => act(() => root.render(
    <ProjectPage runtimeRunning record={record} actions={stubActions()} narrow disclosures={disclosures} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
  ));

  it('leaves out the Needs you section entirely while nothing needs the user', () => {
    render(FIXTURES.build!);
    const text = container.textContent ?? '';
    expect(container.querySelector('#ar-needs-h')).toBeNull();
    expect(text).not.toContain('Needs you');
    expect(text).not.toContain('You have nothing to review');
  });

  it('brings the section back, with its control, as soon as it holds something', () => {
    render({ ...FIXTURES.build!, decisions: [DECISION] });
    expect(container.querySelector('#ar-needs-h')).not.toBeNull();
    expect(container.querySelector('[aria-label="Decision"]')).not.toBeNull();
    expect(container.textContent).toContain(DECISION.question);
  });

  it('says what produces milestones once, in the section header', () => {
    const noMilestones = { ...FIXTURES.build!, milestones: [], charter: null, research: [] };
    render(noMilestones);
    const text = container.textContent ?? '';
    expect(text).toContain('the charter names them, after research');
    expect(text).not.toContain('The charter will name the milestones.');
    expect(text).not.toContain('none yet');
  });

  it('gives colour only to the fault, with several sections empty', () => {
    // One project with nothing needing the user, no milestones and a stopped
    // research Room. Only the stopped Room may be coloured.
    render({
      ...FIXTURES.build!,
      decisions: [],
      milestones: [],
      charter: null,
      research: [],
      blockedReason: 'Research Room room_3240 is cancelled.',
      blockedOn: {
        kind: 'room' as const,
        id: 'room_3240',
        title: 'Import Dashboard Discovery',
        status: 'cancelled',
        at: '2026-09-10T12:00:00.000Z',
      },
    });

    // Only the fault is toned. Every other glyph on the page is neutral, and
    // no section header is warned.
    const tones = [...container.querySelectorAll('.ar-gchip')].map((node) => node.getAttribute('data-tone'));
    expect(tones).toContain('danger');
    expect(tones.filter((tone) => tone !== 'neutral')).toEqual(['danger']);
    expect(container.querySelector('.ar-warn-text')).toBeNull();
    expect(container.textContent).not.toContain('You have nothing to review');
  });
});
