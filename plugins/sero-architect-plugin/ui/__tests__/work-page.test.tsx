// @vitest-environment jsdom

/**
 * The Work view behind the overview: the full plan as readable Markdown, the
 * research and the evidence. What is running now is on the project board.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { FIXTURES } from '../__preview__/fixture';
import type { ArchitectActions } from '../lib/actions';
import type { WorkTab } from '../lib/navigation';
import type { ProjectRecord } from '../../shared/record';
import { WorkPage } from '../WorkPage';

vi.mock('@sero-ai/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
  LiveBlock: () => <div />,
  SubagentLiveBlock: () => <div />,
}));

vi.mock('@sero-ai/app-runtime', async () => ({
  AppContext: (await vi.importActual<typeof import('@sero-ai/app-runtime')>('@sero-ai/app-runtime')).AppContext,
  useAppTools: () => ({ run: vi.fn(async () => ({ text: '', details: null })) }),
  useAppRuntimeEvents: () => undefined,
  getSeroApi: () => ({ appRuntime: null }),
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
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

const actions = { feedback: vi.fn(async () => null) } as unknown as ArchitectActions;
const noop = () => undefined;

function render(record: ProjectRecord, tab: WorkTab, onTab: (tab: WorkTab) => void = noop, runtimeRunning = true) {
  act(() => root.render(
    <WorkPage record={record} actions={actions} runtimeRunning={runtimeRunning} tab={tab} onTab={onTab} onOpenEvidence={noop} onBack={noop} onProject={noop} onOpenHistory={noop} />,
  ));
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
      ['Plan', 'false'], ['Research', 'true'], ['Evidence', 'false'],
    ]);
    act(() => tabs[2]!.click());
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
