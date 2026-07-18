import { describe, expect, it } from 'vitest';
import type {
  AppRuntimeIssueSummary,
  AppRuntimePullRequestSummary,
  OrchestratorBoardLoopView,
} from '@sero-ai/common';
import type { WorkspaceBoardSlice } from '@/types/board';
import {
  buildBoardColumns,
  extractClosedIssueNumbers,
  formatAge,
  formatCost,
  formatTokens,
  formatUntil,
  isUnclaimedIssue,
  loopColumn,
  type BoardWorkspace,
} from './board-model';

const NOW = Date.parse('2026-07-18T12:00:00Z');

const WS: BoardWorkspace = { id: 'ws1', name: 'Sero', path: '/tmp/ws1' };

function loop(partial: Partial<OrchestratorBoardLoopView>): OrchestratorBoardLoopView {
  return {
    id: 'loop-1',
    title: 'Fix flaky tests',
    status: 'active',
    updatedAt: '2026-07-18T11:00:00Z',
    ...partial,
  };
}

function issue(partial: Partial<AppRuntimeIssueSummary>): AppRuntimeIssueSummary {
  return {
    number: 42,
    url: 'https://github.com/o/r/issues/42',
    title: 'Broken thing',
    labels: [],
    assignees: [],
    updatedAt: '2026-07-18T10:00:00Z',
    ...partial,
  };
}

function pr(partial: Partial<AppRuntimePullRequestSummary>): AppRuntimePullRequestSummary {
  return {
    number: 7,
    url: 'https://github.com/o/r/pull/7',
    title: 'A PR',
    headRefName: 'feature',
    updatedAt: '2026-07-18T10:30:00Z',
    ...partial,
  };
}

function slice(partial: Partial<WorkspaceBoardSlice>): Record<string, WorkspaceBoardSlice> {
  return { ws1: { index: null, git: null, issues: [], openPrs: [], ...partial } };
}

describe('loopColumn', () => {
  it('routes attention payloads and blocked loops to Needs Attention', () => {
    expect(loopColumn(loop({ attention: { suggestions: [] } }), NOW)).toBe('attention');
    expect(loopColumn(loop({ status: 'blocked' }), NOW)).toBe('attention');
  });

  it('routes drafts and queued work to Backlog', () => {
    expect(loopColumn(loop({ status: 'draft' }), NOW)).toBe('backlog');
    expect(loopColumn(loop({ snoozedUntil: '2026-07-18T14:00:00Z' }), NOW)).toBe('backlog');
    expect(
      loopColumn(
        loop({
          schedules: [
            { triggerId: 't1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-07-18T13:00:00Z' },
          ],
        }),
        NOW,
      ),
    ).toBe('backlog');
  });

  it('keeps running and idle unscheduled loops in Active', () => {
    expect(loopColumn(loop({ progress: { total: 3, done: 1, running: true } }), NOW)).toBe('active');
    expect(loopColumn(loop({}), NOW)).toBe('active');
  });

  it('running wins over an upcoming schedule', () => {
    expect(
      loopColumn(
        loop({
          progress: { total: 3, done: 1, running: true },
          schedules: [
            { triggerId: 't1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-07-18T13:00:00Z' },
          ],
        }),
        NOW,
      ),
    ).toBe('active');
  });

  it('routes complete to Finished and hides disabled', () => {
    expect(loopColumn(loop({ status: 'complete' }), NOW)).toBe('done');
    expect(loopColumn(loop({ status: 'disabled' }), NOW)).toBeNull();
  });

  it('ignores an elapsed snooze and paused/exhausted schedules', () => {
    expect(loopColumn(loop({ snoozedUntil: '2026-07-18T11:59:00Z' }), NOW)).toBe('active');
    expect(
      loopColumn(
        loop({
          schedules: [
            { triggerId: 't1', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-07-18T13:00:00Z', paused: true },
          ],
        }),
        NOW,
      ),
    ).toBe('active');
  });
});

describe('issue claiming', () => {
  it('extracts closing keywords case-insensitively and dedupes', () => {
    expect(extractClosedIssueNumbers('Closes #12, fixes #9 and closes #12')).toEqual([12, 9]);
    expect(extractClosedIssueNumbers('Resolved #3')).toEqual([3]);
    expect(extractClosedIssueNumbers('see #4')).toEqual([]);
    expect(extractClosedIssueNumbers(undefined)).toEqual([]);
  });

  it('treats assigned issues and PR-linked issues as claimed', () => {
    expect(isUnclaimedIssue(issue({ assignees: ['someone'] }), [])).toBe(false);
    expect(isUnclaimedIssue(issue({}), [pr({ body: 'Closes #42' })])).toBe(false);
    expect(isUnclaimedIssue(issue({}), [pr({ body: 'Closes #41' })])).toBe(true);
    expect(isUnclaimedIssue(issue({}), [])).toBe(true);
  });
});

describe('buildBoardColumns', () => {
  it('merges loops, unclaimed issues, and live sessions into columns', () => {
    const columns = buildBoardColumns(
      [WS],
      slice({
        index: {
          loops: [
            loop({ id: 'running', progress: { total: 2, done: 1, running: true } }),
            loop({ id: 'draft', status: 'draft' }),
            loop({ id: 'needy', attention: { suggestions: [] } }),
            loop({ id: 'finished', status: 'complete' }),
            loop({ id: 'hidden', status: 'disabled' }),
          ],
        },
        issues: [issue({ number: 42 }), issue({ number: 43, assignees: ['x'] })],
      }),
      [{ sessionId: 's1', workspaceId: 'ws1', title: 'Chat', streaming: true }],
      NOW,
    );

    expect(columns.active.map((c) => c.key)).toEqual(['ws1:session:s1', 'ws1:loop:running']);
    expect(columns.backlog.map((c) => c.key)).toEqual(['ws1:loop:draft', 'ws1:issue:42']);
    expect(columns.attention.map((c) => c.key)).toEqual(['ws1:loop:needy']);
    expect(columns.done.map((c) => c.key)).toEqual(['ws1:loop:finished']);
  });

  it('links loop PRs to the issues they close and drops those issues from Backlog', () => {
    const columns = buildBoardColumns(
      [WS],
      slice({
        index: {
          loops: [
            loop({
              id: 'worker',
              progress: { total: 2, done: 0, running: true },
              pullRequests: [{ number: 7, url: 'https://github.com/o/r/pull/7', title: 'Fix' }],
            }),
          ],
        },
        issues: [issue({ number: 42 })],
        openPrs: [pr({ number: 7, body: 'Closes #42' })],
      }),
      [],
      NOW,
    );

    expect(columns.backlog).toEqual([]);
    expect(columns.active[0]).toMatchObject({ kind: 'loop', issueNumbers: [42] });
  });

  it('orders backlog by fire time before drafts before issues', () => {
    const columns = buildBoardColumns(
      [WS],
      slice({
        index: {
          loops: [
            loop({ id: 'draft', status: 'draft' }),
            loop({
              id: 'soon',
              schedules: [
                { triggerId: 't', type: 'cron', schedule: '0 * * * *', nextFireAt: '2026-07-18T13:00:00Z' },
              ],
            }),
          ],
        },
        issues: [issue({ number: 42 })],
      }),
      [],
      NOW,
    );
    expect(columns.backlog.map((c) => c.key)).toEqual([
      'ws1:loop:soon',
      'ws1:loop:draft',
      'ws1:issue:42',
    ]);
  });
});

describe('formatting', () => {
  it('formats tokens, cost, and relative times compactly', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(12_345)).toBe('12.3k');
    expect(formatTokens(2_500_000)).toBe('2.5M');
    expect(formatCost(0.42)).toBe('$0.42');
    expect(formatCost(0.004)).toBe('$0.004');
    expect(formatAge('2026-07-18T11:59:20Z', NOW)).toBe('40s');
    expect(formatAge('2026-07-16T12:00:00Z', NOW)).toBe('2d');
    expect(formatUntil('2026-07-18T13:30:00Z', NOW)).toBe('in 2h');
    expect(formatUntil('2026-07-18T11:00:00Z', NOW)).toBe('due');
  });
});
