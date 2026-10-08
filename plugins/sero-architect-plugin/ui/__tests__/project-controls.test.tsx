// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { DELIVERY_FIXTURES } from '../__preview__/delivery-fixture';
import { DECISION, FIXTURES, INTAKE_WORKSPACES, INTAKE_WORKSPACES_WITH_PROJECT } from '../__preview__/fixture';
import { IntakeDialog } from '../components/IntakeDialog';
import { ControlsMenu } from '../components/TopBar';
import type { ActionOutcome, ArchitectActions } from '../lib/actions';
import type { WorkTab } from '../lib/navigation';
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
    ...(await import('./select-stand-in')),
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

vi.mock('@sero-ai/ui/model-selection/available-model-picker', async () => await import('./model-picker-stand-in'));

const previewExists = vi.hoisted(() => ({ value: true }));

vi.mock('@sero-ai/app-runtime', async () => ({
  // The page follows work feedback through the real hook; with no app context
  // it subscribes to nothing and stays empty.
  AppContext: (await vi.importActual<typeof import('@sero-ai/app-runtime')>('@sero-ai/app-runtime')).AppContext,
  useWorkFeedback: (await vi.importActual<typeof import('@sero-ai/app-runtime')>('@sero-ai/app-runtime')).useWorkFeedback,
  useAppTools: () => ({ run: vi.fn(async (_tool: string, params: { action?: string }) => params.action === 'preview_available' && !previewExists.value
    ? { text: 'No preview command was found in the project workspace.', details: { ok: false } }
    : { text: 'Preview ready', details: { ok: true, url: 'http://localhost:3000' } }) }),
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
    feedback: vi.fn(async () => null),
    create: ok(), history: vi.fn(async () => ({ ...OK, entries: [] })), trace: vi.fn(async () => ({ ...OK, page: null })), lifetime: vi.fn(async () => ({ ...OK, lifetime: null })), pause: ok(), resume: ok(), retry: ok(), stop: ok(), remove: ok(), raiseCap: ok(),
    setExecutionMode: ok(), setAutonomy: ok(), approveCharter: ok(), approveMilestone: ok(), answer: ok(), directive: ok(), requestChange: ok(), enableOpenSpec: ok(),
    setModelDefault: ok(), clearModelDefault: ok(), refreshModelTiers: ok(),
    ...overrides,
  };
}

/** An agreement project whose start the user has not approved yet. */
const UNAPPROVED: ProjectRecord = {
  ...FIXTURES.intake!,
  agreement: { revision: 1, capUsd: 5, proposedAt: '2026-09-07T09:00:00.000Z', approvedAt: null, authority: null },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The intake picker reads the profile workspaces through the host bridge.
  (globalThis as { sero?: unknown }).sero = { workspace: { list: async () => INTAKE_WORKSPACES } };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (globalThis as { sero?: unknown }).sero;
});

const flush = () => act(async () => { await Promise.resolve(); });

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

function renderPage(actions: ArchitectActions, onBack = vi.fn(), record: ProjectRecord = FIXTURES.build!) {
  act(() => root.render(
    <ProjectPage runtimeRunning record={record} actions={actions} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={onBack} confirm={() => true} />,
  ));
  return onBack;
}

it('labels legacy cost as a lower bound without changing the shown spend', () => {
  const base = FIXTURES.build!;
  const record = { ...base, budget: { ...base.budget, spentUsd: 12.34, incomplete: undefined } };
  const spend = () => [...container.querySelectorAll('[aria-label="Project state"] .bd-meter')].find((node) => node.textContent?.includes('$12.34'));
  const show = (shown: ProjectRecord) => act(() => root.render(
    <ProjectPage runtimeRunning record={shown} actions={stubActions()} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
  ));
  show(record);
  // The spend stays a spend: no coverage wording is added to the page.
  expect(container.textContent).not.toContain('cost incomplete');
  expect(spend()?.getAttribute('title')).toContain('lower bound');

  show({ ...record, budget: { ...record.budget, incomplete: false } });
  expect(spend()).toBeDefined();
  expect(spend()?.getAttribute('title')).toBeNull();
});

describe('a refused control', () => {
  it('offers Review access on an unapproved agreement project, runs resume, and shows a refusal', async () => {
    const resume = vi.fn(async () => ({ ok: false, text: 'Permission request was not answered.' }));
    act(() => root.render(
      <ProjectPage runtimeRunning record={UNAPPROVED} actions={stubActions({ resume })} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));
    // Nothing has started: no plan to open, and no note can be sent yet.
    expect(container.querySelector('[aria-label="Plan"]')).toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note to Architect"]')?.disabled).toBe(true);

    act(() => button('Review access').click());
    await flush();
    expect(resume).toHaveBeenCalledWith(UNAPPROVED.id);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Permission request was not answered.');
    expect(button('Review access').disabled).toBe(false);
  });

  it('offers Resume on the page when the Architect stopped and says to resume', async () => {
    const resume = vi.fn(async () => ({ ok: true, text: '' }));
    const stopped = { ...UNAPPROVED, agreement: { ...UNAPPROVED.agreement!, approvedAt: UNAPPROVED.createdAt }, blockedReason: 'The owner turn exceeded 10 minutes and was stopped.' };
    act(() => root.render(
      <ProjectPage runtimeRunning record={stopped} actions={stubActions({ resume })} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));
    act(() => button('Resume').click());
    await flush();
    expect(resume).toHaveBeenCalledWith(stopped.id);
  });

  it('offers no second Review access while the host question is already open', () => {
    act(() => root.render(
      <ProjectPage permissionPending runtimeRunning record={UNAPPROVED} actions={stubActions()} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
    ));
    expect(container.textContent).toContain('Not started');
    expect([...container.querySelectorAll('button')].some((el) => el.textContent?.includes('Review access'))).toBe(false);
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
    const scroll = container.querySelector('.bd-board');
    const composer = container.querySelector('textarea[aria-label="Note to Architect"]');
    expect(scroll).not.toBeNull();
    expect(composer).not.toBeNull();
    expect(scroll?.contains(composer)).toBe(false);
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

/** A delivered project: the result tile is where the preview is offered. */
const DELIVERED = DELIVERY_FIXTURES['board-done']!;

it('offers no preview while the project has nothing to preview', async () => {
  previewExists.value = false;
  try {
    renderPage(stubActions(), vi.fn(), DELIVERED);
    await flush();
    expect(container.querySelector('[aria-label="Result"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((item) => item.textContent?.includes('Open preview'))).toBe(false);
  } finally {
    previewExists.value = true;
  }
});

it('sandboxes the project preview without granting same-origin access', async () => {
  renderPage(stubActions(), vi.fn(), DELIVERED);
  await flush();
  act(() => button('Open preview').click());
  await flush();

  const preview = container.querySelector('iframe');
  expect(preview?.getAttribute('sandbox')).toBe('allow-forms allow-modals allow-popups allow-scripts');
});

describe('changing a decision made', () => {
  it('puts the decision in the message box and focuses it, without sending anything', () => {
    const directive = vi.fn(async () => OK);
    const requestChange = vi.fn(async () => OK);
    const record = DELIVERY_FIXTURES['board-done']!;
    const decided = record.decisions[0]!.options.find((option) => option.id === record.decisions[0]!.answer?.optionId)!.label;
    renderPage(stubActions({ directive, requestChange }), vi.fn(), record);

    const row = [...container.querySelectorAll('[aria-label="Decisions made"] li')].find((item) => item.textContent?.includes(decided));
    act(() => row?.querySelector('button')?.click());

    const box = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note to Architect"]');
    expect(box?.value).toContain(decided);
    expect(document.activeElement).toBe(box);
    expect(directive).not.toHaveBeenCalled();
    expect(requestChange).not.toHaveBeenCalled();
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
    const record = { ...FIXTURES.build!, budget: { ...FIXTURES.build!.budget, capUsd: 0.5 } };
    act(() => root.render(
      <ProjectPage runtimeRunning record={record} actions={stubActions({ raiseCap })} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
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
  it('offers OpenSpec on an existing maintenance Workspace project', () => {
    const controls = {
      pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), raiseCap: vi.fn(),
      setExecutionMode: vi.fn(), enableOpenSpec: vi.fn(), setAutonomy: vi.fn(), openSession: vi.fn(), remove: vi.fn(), openModels: vi.fn(), openInspector: vi.fn(), openHistory: vi.fn(),
    };
    const record = { ...FIXTURES.build!, phase: 'maintain' as const, executionMode: 'workspace' as const, openSpecEnabled: false };
    act(() => root.render(<ControlsMenu record={record} controls={controls} />));
    act(() => button('Enable OpenSpec changes').click());
    expect(controls.enableOpenSpec).toHaveBeenCalledOnce();
    act(() => root.render(<ControlsMenu record={{ ...record, openSpecEnabled: true }} controls={controls} />));
    expect(container.textContent).not.toContain('Enable OpenSpec changes');
  });

  it('offers Resume for paused or blocked projects, and Pause for a cap alone', () => {
    const controls = {
      pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), raiseCap: vi.fn(),
      setExecutionMode: vi.fn(), enableOpenSpec: vi.fn(), setAutonomy: vi.fn(), openSession: vi.fn(), remove: vi.fn(), openModels: vi.fn(), openInspector: vi.fn(), openHistory: vi.fn(),
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
      setExecutionMode: vi.fn(), enableOpenSpec: vi.fn(), setAutonomy: vi.fn(), openSession: vi.fn(), remove: vi.fn(), openModels: vi.fn(), openInspector: vi.fn(), openHistory,
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
    act(() => root.render(<IntakeDialog open onClose={onClose} onCreate={onCreate} defaultFolder="~/Projects/x" takenWorkspaceIds={INTAKE_WORKSPACES_WITH_PROJECT} />));

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

    expect(onCreate).toHaveBeenCalledWith({ idea: 'A roguelike', capUsd: 5, folder: '~/Projects/x/game', executionMode, openSpecEnabled: false, models: [] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers free workspaces first, disables the ones with a project, and leaves Global out', async () => {
    act(() => root.render(<IntakeDialog open onClose={vi.fn()} onCreate={vi.fn(async () => OK)} defaultFolder="~/Projects/x" takenWorkspaceIds={INTAKE_WORKSPACES_WITH_PROJECT} initialMode="existing" />));
    await flush();
    await flush();

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Workspace"]');
    if (!select) throw new Error('no workspace picker');
    const options = [...select.querySelectorAll('option')];
    // The free workspaces come first, in the bridge's order, then the ones a project holds.
    expect(options.map((option) => option.value)).toEqual([
      'testrepo',
      'architecttest',
      'planner-scope-diagnostic-01',
      'optimizer-agent-q0oqut',
      'froggerneon',
      'dungeonexplorer',
      'dungeonexplorer-resilience-01',
      'csv-summary-resilience-01',
      'csv-summary-resilience-02',
      'reading-tracker-resilience-01',
      'import-dashboard-resilience-01',
      'import-dashboard-resilience-02',
      'workspace-placement-diagnostic-01',
    ]);
    expect(options.find((option) => option.value === 'froggerneon')?.disabled).toBe(true);
    expect(options.find((option) => option.value === 'testrepo')?.disabled).toBe(false);
    expect(options.some((option) => option.value === 'global')).toBe(false);
  });

  it('starts on a chosen workspace and submits its id instead of a folder', async () => {
    const onCreate = vi.fn(async () => ({ ok: true, text: 'created', projectId: 'frogger' }));
    act(() => root.render(<IntakeDialog open onClose={vi.fn()} onCreate={onCreate} defaultFolder="~/Projects/x" takenWorkspaceIds={INTAKE_WORKSPACES_WITH_PROJECT} />));

    const existing = [...container.querySelectorAll('button')].find((el) => el.textContent === 'Existing workspace');
    if (!existing) throw new Error('no Existing workspace choice');
    act(() => existing.click());
    await flush();

    const idea = container.querySelector<HTMLTextAreaElement>('#ar-idea')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(idea, 'Add a JSON flag');
      idea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Workspace"]');
    if (!select) throw new Error('no workspace picker');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'testrepo');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => { select.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(onCreate).toHaveBeenCalledWith({ idea: 'Add a JSON flag', capUsd: 5, executionMode: 'workspace', openSpecEnabled: false, models: [], workspaceId: 'testrepo' });
  });

  it('keeps the dialog open and shows the runtime refusal', async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn(async () => ({ ok: false, text: 'The folder /home/dan/projects/taken already exists.' }));
    act(() => root.render(<IntakeDialog open onClose={onClose} onCreate={onCreate} defaultFolder="~/Projects/x" takenWorkspaceIds={[]} />));

    const idea = container.querySelector<HTMLTextAreaElement>('#ar-idea')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(idea, 'A roguelike');
      idea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      const name = container.querySelector<HTMLInputElement>('#ar-name')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'taken');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { idea.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('already exists');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('names the first missing field when Continue is pressed, and creates nothing', async () => {
    const onCreate = vi.fn(async () => OK);
    act(() => root.render(<IntakeDialog open onClose={vi.fn()} onCreate={onCreate} defaultFolder="~/Projects/x" takenWorkspaceIds={[]} />));
    const form = container.querySelector<HTMLFormElement>('#ar-idea')!.form!;
    const type = (selector: string, value: string, proto: typeof HTMLInputElement | typeof HTMLTextAreaElement = HTMLInputElement) => act(() => {
      const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = async () => {
      act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await flush();
      return container.querySelector('[role="alert"]')?.textContent;
    };

    expect(button('Continue').disabled).toBe(false);
    expect(await submit()).toBe('Tell Architect what you want.');
    type('#ar-idea', 'A roguelike', HTMLTextAreaElement);
    expect(await submit()).toBe('Enter a folder name.');
    type('#ar-name', 'game');
    type('#ar-cap', '');
    expect(await submit()).toBe('Enter a start cap.');
    expect(onCreate).not.toHaveBeenCalled();

    act(() => [...container.querySelectorAll('button')].find((el) => el.textContent === 'Existing workspace')?.click());
    await flush();
    type('#ar-cap', '7');
    expect(await submit()).toBe('Choose a workspace.');
    expect(onCreate).not.toHaveBeenCalled();

    act(() => [...container.querySelectorAll('button')].find((el) => el.textContent === 'New folder')?.click());
    expect(await submit()).toBeUndefined();
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ idea: 'A roguelike', capUsd: 7 }));
  });

  it('keeps the model overrides folded until asked, then shows one row per tier', () => {
    act(() => root.render(<IntakeDialog open onClose={vi.fn()} onCreate={vi.fn(async () => OK)} defaultFolder="~/Projects/x" takenWorkspaceIds={[]} />));
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

  const show = (record: ProjectRecord, actions: ArchitectActions = stubActions(), onOpenWork: (tab: WorkTab) => void = () => undefined) => act(() => root.render(
    <ProjectPage runtimeRunning record={record} actions={actions} onOpenWork={onOpenWork} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
  ));
  const stoppedTile = () => container.querySelector('[aria-label="Stopped"]')!;
  const submitIn = async (form: HTMLFormElement | null) => {
    act(() => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
  };

  it('heads the page with the request, then the state, and offers Retry step on the stop', async () => {
    const retry = vi.fn(async () => OK);
    const record = stoppedProject();
    show(record, stubActions({ retry }));

    // With no Architect sentence yet, the top says the request itself.
    const header = container.querySelector('[aria-label="Project state"]')!;
    expect(header.textContent).toContain(record.idea);
    expect(stoppedTile().textContent).toContain(`${record.milestones[0].title} stopped`);
    const retryButton = [...stoppedTile().querySelectorAll('button')].find((node) => node.textContent === 'Retry step');
    expect(retryButton).toBeDefined();

    act(() => retryButton!.click());
    await flush();

    expect(retry).toHaveBeenCalledWith(record.id, record.milestones[0].id);
  });

  it('heads the page with the Architect outcome sentence when it has written one', () => {
    show({ ...FIXTURES.build!, overview: { outcome: { text: 'A shareable roguelike.', at: '2026-09-07T09:00:00.000Z' } } });
    expect(container.querySelector('[aria-label="Project state"]')?.textContent).toContain('A shareable roguelike.');
  });

  it('puts the new-cap field on the stop when the spend cap stopped the project', () => {
    // Raising the cap needs a number, so the stop carries the field rather than a button that reveals one.
    const base = FIXTURES.limited!;
    show({ ...base, budget: { ...base.budget, spentUsd: base.budget.capUsd ?? 0 } });

    expect(stoppedTile().querySelector('#ar-header-cap-in')).not.toBeNull();
    expect(stoppedTile().querySelector('form button')?.textContent).toBe('Raise and resume');
  });

  it('raises the cap through one action, whichever copy the user reaches', async () => {
    const base = FIXTURES.limited!;
    const record = { ...base, budget: { ...base.budget, spentUsd: base.budget.capUsd ?? 0 } };
    const raiseCap = vi.fn(async () => OK);
    show(record, stubActions({ raiseCap }));

    await submitIn(stoppedTile().querySelector('form'));

    expect(raiseCap).toHaveBeenCalledWith(record.id, expect.any(Number));
    // Raise cap is still in the project menu; the field on the stop is the one the user reaches first.
    expect(stoppedTile().querySelector('#ar-header-cap-in')).not.toBeNull();
  });

  it('carries a Workflow cap resume on the stop, whole', async () => {
    // Its own field, its own wording, and the retry action with the new cap.
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
    show(record, stubActions({ retry }));

    expect(stoppedTile().querySelector('#ar-header-wf-cap-in')).not.toBeNull();
    expect(stoppedTile().querySelector('form button')?.textContent).toBe('Approve cap and resume');

    await submitIn(stoppedTile().querySelector('form'));

    expect(retry).toHaveBeenCalledWith(record.id, first.id, expect.any(Number));
  });

  it('says what stopped, and why, once', () => {
    show(stoppedProject());
    expect((container.textContent ?? '').split('Interrupted work').length - 1).toBe(1);
  });

  it('keeps the Architect report off the overview', () => {
    const record = stoppedProject();
    show(record);
    expect(container.textContent).not.toContain(record.stateLine);
  });

  it('leads to the plan and the proof once the work has started, and says which flow a charter project is on', () => {
    const onOpenWork = vi.fn();
    show(FIXTURES.build!, stubActions(), onOpenWork);
    expect(container.textContent).toContain('This project uses the charter flow. The charter flow is deprecated.');

    act(() => button('Full plan').click());
    expect(onOpenWork).toHaveBeenLastCalledWith('plan');
    // The build fixture has checked milestones, so their evidence is offered too.
    act(() => button('See the proof').click());
    expect(onOpenWork).toHaveBeenLastCalledWith('evidence');
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
    <ProjectPage runtimeRunning record={record} actions={stubActions()} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
  ));

  const stopped = () => container.querySelector('[aria-label="Stopped"]')!;

  it('keeps the autonomy setting out of the top and the stop, and in the project menu', () => {
    render(cancelledRoom());
    // The page says what stopped and what to do about it, nothing else. The
    // setting itself is a menu entry, checked in the controls-menu tests above.
    for (const text of [container.querySelector('[aria-label="Project state"]')?.textContent, stopped().textContent]) {
      expect(text).not.toContain('You approve each milestone plan');
      expect(text).not.toContain('Autonomy');
    }
  });

  it('states what happened and why, instead of printing the Room id', () => {
    render(cancelledRoom());
    const tile = stopped().textContent ?? '';
    expect(tile).toContain('Research was cancelled before it reported');
    expect(tile).toContain('Its members had read-only access and could not run commands.');
    expect(tile).not.toContain('room_3240');
  });

  it('names the Room that stopped, so the user knows which one Open Room opens', () => {
    render(cancelledRoom());
    expect(stopped().textContent).toContain('Import Dashboard Discovery');
  });

  it('offers opening the Room and telling the Architect what to do next', () => {
    render(cancelledRoom());
    const labels = [...stopped().querySelectorAll('button')].map((node) => node.textContent);
    expect(labels.slice(0, 2)).toEqual(['Open Room', 'Tell Architect what to do next']);
  });

  it('puts the cursor in the existing directive box rather than opening another', () => {
    render(cancelledRoom());
    const tell = [...stopped().querySelectorAll<HTMLButtonElement>('button')]
      .find((node) => node.textContent === 'Tell Architect what to do next');
    const composers = container.querySelectorAll('textarea[aria-label="Note to Architect"]');
    expect(composers).toHaveLength(1);

    act(() => tell?.click());
    expect(document.activeElement).toBe(composers[0]);
    // Still one box: the control is a way in, not a second way to send.
    expect(container.querySelectorAll('textarea[aria-label="Note to Architect"]')).toHaveLength(1);
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
    <ProjectPage runtimeRunning record={record} actions={stubActions()} onOpenWork={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} onBack={vi.fn()} confirm={() => true} />,
  ));

  it('shows the decision card as soon as a decision is open', () => {
    render({ ...FIXTURES.build!, decisions: [DECISION] });
    expect(container.querySelector('[aria-label="Decision"]')).not.toBeNull();
    // The question is on its card once. The top only says the project waits for the user.
    expect(container.textContent?.split(DECISION.question).length).toBe(2);
    expect(container.querySelector('[aria-label="Project state"]')?.textContent).toContain('Waiting for you');
  });

  it('draws nothing for empty sections and tones only the fault', () => {
    // One project with nothing needing the user, no milestones and a stopped research Room.
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

    for (const label of ['Needs you', 'Plan', 'Live']) expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull();
    expect(container.querySelector('[aria-label="Stopped"] h2')?.getAttribute('data-tone')).toBe('stopped');
    // Nothing is asked of the user, so nothing is toned as waiting for them.
    expect(container.querySelector('[data-tone="waiting"]')).toBeNull();
    expect(container.textContent).not.toContain('You have nothing to review');
  });
});
