// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXTURES } from '../__preview__/fixture';
import { MilestoneRail } from '../components/MilestoneRail';
import { PROJECTS_TOOL } from '../lib/actions';

const openSeroApp = vi.fn(async () => true);
const runTool = vi.fn(async () => ({
  text: '', content: [], details: { ok: true, url: 'http://localhost:5173' }, isError: false,
}));
vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: (...args: unknown[]) => openSeroApp(...(args as [])),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
  useAppTools: () => ({ run: runTool }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  openSeroApp.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the milestone rail', () => {
  it('leaves the recovery control to the header rather than repeating it', () => {
    const source = FIXTURES.build!;
    const first = source.milestones.find((item) => item.dispatch?.kind === 'workflow')!;
    const record = { ...source, milestones: [{ ...first, dispatch: { ...first.dispatch!, failure: 'Interrupted work', retryStepId: 'check' } }] };
    const open = vi.fn();
    act(() => root.render(<MilestoneRail record={record} onOpenDispatch={open} />));
    // The row keeps its title, its state and its Orchestrator link, and offers
    // no second copy of the control the project header already carries: the
    // same button twice gave no way to tell which one mattered.
    const labels = Array.from(container.querySelectorAll('button')).map((item) => item.textContent);
    expect(labels).not.toContain('Retry step');
    expect(labels).not.toContain('Approve cap and resume');
    expect(container.querySelector(`[data-testid="open-${first.id}"]`)).not.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it('shows one row per check, each owning its own output and duration', async () => {
    const source = FIXTURES.build!;
    const first = source.milestones[0];
    const record = {
      ...source,
      milestones: [{
        ...first,
        evidence: {
          commit: '3f1c2ab9',
          checkedAt: first.evidence!.checkedAt,
          commands: [
            { command: 'pnpm test', exitCode: 0, output: '38 passed', durationMs: 800 },
            { command: 'pnpm build', exitCode: 1, output: 'boom', durationMs: 900 },
          ],
          diffSummary: 'untracked:\na.md\nb.md',
          filesChanged: true,
          preview: { route: '/', smokePassed: true, capturePath: 'evidence/shot.png' },
          passed: false,
          stale: false,
        },
      }, ...source.milestones.slice(1)],
    };
    act(() => root.render(<MilestoneRail record={record} onOpenDispatch={vi.fn()} />));

    const rows = Array.from(container.querySelectorAll('.ar-checks > li'));
    expect(rows.map((row) => row.querySelector('.ar-check-name')?.textContent)).toEqual([
      'pnpm test', 'pnpm build', '2 new files', 'Page / responded', 'Screenshot of /',
    ]);
    // Nothing is shown until a row is opened, and each row has its own fold, so
    // opening one cannot close another.
    const folds = Array.from(container.querySelectorAll('.ar-checks details')) as HTMLDetailsElement[];
    expect(folds).toHaveLength(4);
    expect(folds.every((fold) => !fold.open)).toBe(true);
    expect(folds[0].querySelector('pre')?.textContent).toBe('38 passed');
    expect(folds[1].querySelector('pre')?.textContent).toBe('boom');

    // Durations come from the record; the checks that have none show none.
    expect(rows.map((row) => row.querySelector('.ar-check-t')?.textContent)).toEqual([
      '0.8s', '0.9s', undefined, undefined, undefined,
    ]);

    // The capture row runs the same preview action the preview card runs.
    runTool.mockClear();
    const openPreview = Array.from(rows[4].querySelectorAll('button')).find((button) => button.textContent === 'Open preview')!;
    await act(async () => openPreview.click());
    expect(runTool).toHaveBeenCalledWith(PROJECTS_TOOL, { action: 'preview', projectId: source.id });
  });

  it('shows one Orchestrator link per dispatched milestone and none for the rest', () => {
    const onOpenDispatch = vi.fn();
    act(() => root.render(<MilestoneRail record={FIXTURES.decision!} onOpenDispatch={onOpenDispatch} />));
    const links = Array.from(container.querySelectorAll('.ar-btn-link')).map((link) => link.getAttribute('data-testid'));
    expect(links).toEqual(['open-m1', 'open-m2', 'open-m3']);
    expect(container.querySelectorAll('.ar-ms').length).toBe(5);
  });

  it('opens the Workflow or the Room record through the Orchestrator app', async () => {
    const { openDispatch } = await import('../lib/page-helpers');
    act(() => root.render(<MilestoneRail record={FIXTURES.decision!} onOpenDispatch={openDispatch} />));
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-m2"]')!.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-m3"]')!.click());
    expect(openSeroApp.mock.calls).toEqual([
      ['orchestrator', { loopId: 'workflow-m2' }, 'ws-hollow'],
      ['orchestrator', { roomId: 'room-m3' }, 'ws-hollow'],
    ]);
  });

  it('keeps evidence behind a disclosure and shows no step detail', () => {
    act(() => root.render(<MilestoneRail record={FIXTURES.build!} onOpenDispatch={vi.fn()} />));
    const evidence = container.querySelector<HTMLDetailsElement>('details.ar-evidence');
    expect(evidence?.open).toBe(false);
    expect(evidence?.querySelector('summary')?.textContent).toContain('Evidence at 3f1c2ab');
    expect(container.textContent).not.toContain('step 4 of 7');
  });
});
