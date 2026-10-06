// @vitest-environment jsdom

/**
 * The Work view behind the overview: the full plan as readable Markdown, and
 * what is running now, grouped by the Room or Workflow it runs in.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ARCHITECT_APP_ID, type WorkFeedback } from '@sero-ai/common';

import { FIXTURES } from '../__preview__/fixture';
import type { ArchitectActions } from '../lib/actions';
import type { WorkTab } from '../lib/navigation';
import type { ProjectRecord } from '../../shared/record';
import { workGroups } from '../lib/work-groups';
import { WorkPage } from '../WorkPage';

const EPOCH = '2026-10-03T09:00:00.000Z';
const NOW = '2026-10-03T09:30:00.000Z';

/** What the feedback hook reports. Each test sets it before rendering. */
let reported: WorkFeedback[] = [];
/** The running child agents the host reports, by the session that started them. */
let childRuns = new Map<string, { id: string; agentName: string; parentSessionId: string; startedAt: number; toolActivity: { toolName: string; argsSummary: string; running: boolean }[] }[]>();

vi.mock('@sero-ai/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
  LiveBlock: () => <div />,
  SubagentLiveBlock: () => <div />,
}));

vi.mock('@sero-ai/app-runtime', async () => ({
  AppContext: (await vi.importActual<typeof import('@sero-ai/app-runtime')>('@sero-ai/app-runtime')).AppContext,
  // The seam under test is how the page groups what a runtime reported, not the transport.
  useWorkFeedback: () => ({ epoch: reported.length > 0 ? EPOCH : null, snapshots: new Map(reported.map((entry) => [entry.key, entry])) }),
  useAppTools: () => ({ run: vi.fn(async () => ({ text: '', details: null })) }),
  useAppRuntimeEvents: () => undefined,
  useChildRuns: (_workspaceId: string | null, sessions: readonly string[]) => new Map([...childRuns].filter(([session]) => sessions.includes(session))),
  getSeroApi: () => ({ appRuntime: null }),
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  reported = [];
  childRuns = new Map();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const actions = { feedback: vi.fn(async () => null) } as unknown as ArchitectActions;
const noop = () => undefined;

function render(record: ProjectRecord, tab: WorkTab, onTab: (tab: WorkTab) => void = noop, runtimeRunning = true) {
  act(() => root.render(
    <WorkPage record={record} actions={actions} runtimeRunning={runtimeRunning} tab={tab} onTab={onTab} onOpenEvidence={noop} onBack={noop} onProject={noop} onOpenHistory={noop} />,
  ));
}

function feedback(key: string, over: Partial<WorkFeedback> = {}): WorkFeedback {
  return {
    key, kind: 'room-member', owner: key, scope: { appId: 'orchestrator', workspaceId: 'ws-hollow', workId: 'room-1', projectId: 'hollow-depths', memberId: key },
    epoch: EPOCH, revision: 1, turnId: 't1', attached: true, wait: { kind: 'tool', toolName: 'bash', since: NOW }, openCalls: 1,
    lastActivityAt: NOW, contactObservedAt: NOW, terminal: null, ...over,
  };
}

/** A project whose first milestone runs in a Room named by the record. */
function roomProject(): ProjectRecord {
  const base = FIXTURES.build!;
  const [first, ...rest] = base.milestones;
  return {
    ...base,
    workspaceId: 'ws-hollow',
    milestones: [
      { ...first!, title: 'Build the synth', dispatch: { kind: 'room', id: 'room-1', workspaceId: 'ws-hollow', dispatchedAt: EPOCH, chargedUsd: 0, destination: null } },
      ...rest,
    ],
  };
}

describe('the Plan tab', () => {
  it('renders the brief, the approval rules and each milestone plan as Markdown', () => {
    const base = FIXTURES.charter!;
    const record: ProjectRecord = {
      ...base,
      brief: '## Goal\n\nBuild a small synth.\n\n## Choices\n\n- Keep the $5 cap.\n- Use `AudioContext`.',
      charter: { ...base.charter!, capUsd: 5, escalationPolicy: '- Ask before external delivery.\n- Ask before spending more than $5.' },
      milestones: [{ ...base.milestones[0]!, plan: '## Steps\n\n1. Build the core.\n2. Run `pnpm test`.\n\n## Checks\n\n- All tests must pass.' }, ...base.milestones.slice(1)],
    };
    render(record, 'plan');

    const headings = [...container.querySelectorAll('h2')].map((node) => node.textContent);
    expect(headings).toEqual(expect.arrayContaining(['Goal', 'Choices', 'Steps', 'Checks']));
    expect([...container.querySelectorAll('code')].map((node) => node.textContent)).toEqual(expect.arrayContaining(['AudioContext', 'pnpm test']));
    expect([...container.querySelectorAll('li')].map((node) => node.textContent)).toEqual(expect.arrayContaining(['Ask before spending more than $5.', 'Run pnpm test.', 'All tests must pass.']));
  });

  it('shows the request as written and says when nothing has been planned', () => {
    render(FIXTURES.intake!, 'plan');
    expect(container.textContent).toContain(FIXTURES.intake!.idea);
    expect(container.textContent).toContain('Planning is not recorded yet.');
  });

  it("keeps the Architect's last report and every note and reply here, not on the overview", () => {
    const record = FIXTURES.decision!;
    render(record, 'plan');
    expect(container.textContent).toContain(record.stateLine);
    for (const directive of record.directives) {
      expect(container.textContent).toContain(directive.text);
      if (directive.reply) expect(container.textContent).toContain(directive.reply.text);
    }
  });
});

describe('the tabs', () => {
  it('marks the open tab and reports the one pressed', () => {
    const onTab = vi.fn();
    render(FIXTURES.build!, 'research', onTab);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((node) => [node.textContent, node.getAttribute('aria-selected')])).toEqual([
      ['Live', 'false'], ['Plan', 'false'], ['Research', 'true'], ['Evidence', 'false'],
    ]);
    act(() => tabs[3]!.click());
    expect(onTab).toHaveBeenCalledWith('evidence');
  });

  it('says so when there is no research and no recorded check', () => {
    const none = { ...FIXTURES.intake!, research: [], pendingResearch: [] };
    render(none, 'research');
    expect(container.textContent).toContain('No research is recorded.');
    render(none, 'evidence');
    expect(container.textContent).toContain('No checks are recorded yet.');
  });
});

describe('the Live tab', () => {
  it('says nothing runs when no work is open', () => {
    render(roomProject(), 'live');
    expect(container.textContent).toContain('No work is running.');
  });

  it('groups running work by Room, names the Room from the milestone title, and drops ended work', () => {
    const record = roomProject();
    reported = [
      feedback('writer'),
      feedback('reviewer'),
      feedback('done', { terminal: { outcome: 'ok', at: NOW } }),
      feedback('owner', { kind: 'owner-wake', scope: { appId: ARCHITECT_APP_ID, workspaceId: 'ws-hollow', projectId: record.id } }),
    ].map((entry) => ({ ...entry, scope: { ...entry.scope, projectId: record.id } }));

    expect(workGroups(record, reported, EPOCH).map((group) => [group.title, group.rows.map((row) => row.key)])).toEqual([
      ['Architect', ['owner']],
      ['Room · Build the synth', ['writer', 'reviewer']],
    ]);
    // Between its turns the owner is idle, not lost, so it is not listed.
    const resting = reported.map((entry) => entry.key === 'owner' ? { ...entry, attached: false, wait: null, openCalls: 0 } : entry);
    expect(workGroups(record, resting, EPOCH).map((group) => group.title)).toEqual(['Room · Build the synth']);

    vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
    try {
      render(record, 'live');
    } finally {
      vi.useRealTimers();
    }
    expect(container.querySelectorAll('[role="tabpanel"] section')).toHaveLength(2);
    expect(container.textContent).toContain('Room · Build the synth');
    expect(container.textContent).toContain('Open Room');
    // A working member row can be watched; an ended one is not listed at all.
    expect(container.querySelector('[aria-label="Watch writer"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Watch done"]')).toBeNull();
  });

  it('lists an agent a member started under that member, matched by the member session', () => {
    const record = roomProject();
    const member = (key: string, sessionId: string) => ({ ...feedback(key), scope: { ...feedback(key).scope, projectId: record.id, sessionId } });
    reported = [member('writer', 'session-writer'), member('reviewer', 'session-reviewer')];
    const child = { id: 'run-1', agentName: 'scout', parentSessionId: 'session-reviewer', startedAt: Date.parse(NOW), toolActivity: [{ toolName: 'grep', argsSummary: 'oscillator', running: true }] };
    childRuns = new Map([['session-reviewer', [child]], ['session-elsewhere', [{ ...child, id: 'run-2', agentName: 'stranger', parentSessionId: 'session-elsewhere' }]]]);
    vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
    try {
      render(record, 'live');
    } finally {
      vi.useRealTimers();
    }
    const rows = [...container.querySelectorAll('.wk')].map((row) => [row.querySelector('.wk-who')?.textContent, row.hasAttribute('data-child')]);
    expect(rows).toEqual([['writer', false], ['reviewer', false], ['scout', true]]);
    expect(container.textContent).toContain('grep oscillator');
  });

  it('says live work cannot be confirmed when the runtime is not running, and offers no watch', () => {
    const record = roomProject();
    reported = [{ ...feedback('writer'), scope: { ...feedback('writer').scope, projectId: record.id } }];
    render(record, 'live', noop, false);
    expect(container.textContent).toContain('Live work cannot be confirmed in this session.');
    expect(container.querySelector('[aria-label="Watch writer"]')).toBeNull();
  });
});
