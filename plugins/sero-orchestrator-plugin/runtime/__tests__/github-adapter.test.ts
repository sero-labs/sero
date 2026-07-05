/**
 * GitHub event source (spec 12 Phase 4): the anti-abuse envelope is behavior
 * under test — demand-scoped endpoints, the 60s cadence floor, conditional
 * requests, rate-limit/failure backoff, and the restart-safe cursor. All polls
 * run against the fake host's scripted `runCommand`.
 */

import { describe, expect, it } from 'vitest';
import type { OrchestratorEvent } from '../../shared/types';
import { readAdapterState } from '../events/adapter-state';
import {
  baseIntervalMs,
  createGithubAdapter,
  DEFAULT_INTERVAL_MS,
  MIN_INTERVAL_MS,
  nextDelayMs,
  type GithubAdapter,
  type GithubAdapterState,
} from '../events/github-adapter';
import { parseGhApiOutput } from '../events/github-http';
import { extractOccurrences, GITHUB_ENDPOINTS } from '../events/github-kinds';
import type { EventSubscription } from '../events/types';
import { createFakeHost, type FakeHost } from './fake-host';

const NEVER_MS = 3_600_000; // keeps the real timer from firing during a test

function subscription(loopId: string, kind: string): EventSubscription {
  return { loopId, eventSource: `github:${kind}` };
}

function recordingEmit(): { events: OrchestratorEvent[]; emit: (e: OrchestratorEvent) => Promise<void> } {
  const events: OrchestratorEvent[] = [];
  return {
    events,
    emit: async (event) => {
      events.push(event);
    },
  };
}

/** `gh api --include` stdout: status line + headers + blank line + JSON body. */
function ghOk(body: unknown, headers: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  return {
    stdout: `HTTP/2.0 200 OK\r\n${lines.join('\r\n')}\r\n\r\n${JSON.stringify(body)}`,
    stderr: '',
    exitCode: 0,
  };
}

function ghError(status: number, headers: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  return {
    stdout: `HTTP/2.0 ${status} Error\r\n${lines.join('\r\n')}\r\n\r\n{"message":"boom"}`,
    stderr: `gh: HTTP ${status}`,
    exitCode: 1,
  };
}

function makeAdapter(host: FakeHost, subs: EventSubscription[]): { adapter: GithubAdapter; events: OrchestratorEvent[] } {
  const { events, emit } = recordingEmit();
  const adapter = createGithubAdapter(host, emit, { firstPollDelayMs: NEVER_MS, random: () => 0.5 });
  adapter.sync(subs);
  return { adapter, events };
}

const PR_A = { id: 11, number: 1, title: 'First', created_at: '2026-03-01T10:00:00Z', user: { login: 'dan' }, head: { ref: 'a' }, base: { ref: 'main' }, html_url: 'https://x/pr/1' };
const PR_B = { id: 22, number: 2, title: 'Second', created_at: '2026-03-02T10:00:00Z', user: { login: 'dan' }, head: { ref: 'b' }, base: { ref: 'main' }, html_url: 'https://x/pr/2' };

describe('gh api output parsing', () => {
  it('reads status, etag, rate-limit headers, and the JSON body', () => {
    const parsed = parseGhApiOutput(
      ghOk([{ ok: true }], { Etag: 'W/"abc"', 'X-Ratelimit-Remaining': '4000', 'X-Ratelimit-Reset': '1750000000' }).stdout,
      '',
      0,
    );
    expect(parsed.status).toBe(200);
    expect(parsed.etag).toBe('W/"abc"');
    expect(parsed.rateLimitRemaining).toBe(4000);
    expect(parsed.rateLimitResetMs).toBe(1_750_000_000_000);
    expect(parsed.body).toEqual([{ ok: true }]);
  });

  it('recognises a 304 stated only on stderr', () => {
    const parsed = parseGhApiOutput('', 'gh: HTTP 304: Not Modified', 1);
    expect(parsed.status).toBe(304);
    expect(parsed.body).toBeUndefined();
  });

  it('treats a 2xx with unparsable JSON as body-less', () => {
    const parsed = parseGhApiOutput('HTTP/2.0 200 OK\r\n\r\n{broken', '', 0);
    expect(parsed.status).toBe(200);
    expect(parsed.body).toBeUndefined();
  });
});

describe('cadence floor and delay math', () => {
  it('enforces the 60s floor in code — config can slow, never speed', () => {
    expect(baseIntervalMs(undefined)).toBe(DEFAULT_INTERVAL_MS);
    expect(baseIntervalMs(10_000)).toBe(MIN_INTERVAL_MS);
    expect(baseIntervalMs(300_000)).toBe(300_000);
  });

  it('doubles under rate-limit pressure, backs off exponentially on failures, capped, with jitter', () => {
    const base = { baseMs: 120_000, consecutiveFailures: 0, rateLimitedUntilMs: 0, nowMs: 1_000, random: () => 0.5 };
    expect(nextDelayMs(base)).toBe(120_000);
    expect(nextDelayMs({ ...base, rateLimitedUntilMs: 2_000 })).toBe(240_000);
    expect(nextDelayMs({ ...base, consecutiveFailures: 1 })).toBe(240_000);
    expect(nextDelayMs({ ...base, consecutiveFailures: 2 })).toBe(480_000);
    expect(nextDelayMs({ ...base, consecutiveFailures: 20 })).toBe(1_800_000); // 30 min cap
    // Jitter stays within ±10%.
    expect(nextDelayMs({ ...base, random: () => 0 })).toBe(108_000);
    expect(nextDelayMs({ ...base, random: () => 1 })).toBe(132_000);
  });
});

describe('demand scoping and the shared poller', () => {
  it('queries only the endpoints implied by live subscriptions', async () => {
    const host = createFakeHost();
    const { adapter } = makeAdapter(host, [subscription('loop-1', 'pr-opened')]);
    host.commandResults.push(ghOk([PR_A]));
    await adapter.pollOnce();

    expect(host.commands).toHaveLength(1);
    expect(host.commands[0]).toContain('/pulls?');
    expect(host.commands[0]).not.toContain('actions/runs');

    adapter.sync([subscription('loop-1', 'pr-opened'), subscription('loop-2', 'ci-failed')]);
    host.commandResults.push(ghOk([PR_A]), ghOk({ workflow_runs: [] }));
    await adapter.pollOnce();
    expect(host.commands.some((command) => command.includes('actions/runs'))).toBe(true);
  });

  it('N loops on one repo cost one poll cycle', async () => {
    const host = createFakeHost();
    const { adapter } = makeAdapter(host, [
      subscription('loop-1', 'pr-opened'),
      subscription('loop-2', 'pr-opened'),
      subscription('loop-3', 'pr-opened'),
    ]);
    host.commandResults.push(ghOk([PR_A]));
    await adapter.pollOnce();
    expect(host.commands).toHaveLength(1);
  });

  it('ignores unknown github sources instead of polling for them', async () => {
    const host = createFakeHost();
    const { adapter } = makeAdapter(host, [subscription('loop-1', 'stars-changed')]);
    await adapter.pollOnce();
    expect(host.commands).toEqual([]);
    expect(host.logs.some((line) => line.includes('unknown source "github:stars-changed"'))).toBe(true);
  });
});

describe('conditional requests and cursors', () => {
  it('baselines on first poll, emits only newer items after, and sends the stored ETag', async () => {
    const host = createFakeHost();
    const { adapter, events } = makeAdapter(host, [subscription('loop-1', 'pr-opened')]);

    host.commandResults.push(ghOk([PR_A], { Etag: 'W/"v1"' }));
    await adapter.pollOnce();
    expect(events).toEqual([]); // subscribing must not replay repo history
    const state = await readAdapterState<GithubAdapterState>(host, 'github');
    expect(state?.cursors?.['pr-opened']).toBe(PR_A.created_at);
    expect(state?.etags?.pulls).toBe('W/"v1"');

    host.commandResults.push(ghOk([PR_B, PR_A], { Etag: 'W/"v2"' }));
    await adapter.pollOnce();
    expect(host.commands[1]).toContain('If-None-Match: W/"v1"');
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('github:pr-opened');
    expect(events[0].dedupeKey).toBe('github:pr-opened:22');
    expect(events[0].payload).toMatchObject({ number: 2, title: 'Second', author: 'dan', branch: 'b' });

    // 304 steady state: nothing new, no failure counted.
    host.commandResults.push({ stdout: '', stderr: 'gh: HTTP 304', exitCode: 1 });
    await adapter.pollOnce();
    expect(events).toHaveLength(1);
    expect(adapter.debug().consecutiveFailures).toBe(0);
  });

  it('survives a restart without replaying or missing events', async () => {
    const host = createFakeHost();
    const first = makeAdapter(host, [subscription('loop-1', 'pr-opened')]);
    host.commandResults.push(ghOk([PR_A]));
    await first.adapter.pollOnce();
    first.adapter.dispose();

    // "Restart": a fresh adapter over the same persisted state.
    const second = makeAdapter(host, [subscription('loop-1', 'pr-opened')]);
    host.commandResults.push(ghOk([PR_B, PR_A]));
    await second.adapter.pollOnce();
    expect(second.events).toHaveLength(1); // PR_B fires (the gap), PR_A does not (no replay)
    expect(second.events[0].dedupeKey).toBe('github:pr-opened:22');
  });
});

describe('backoff transitions', () => {
  it('counts failed cycles, honours 403 reset headers, and recovers on success', async () => {
    const host = createFakeHost();
    const { adapter } = makeAdapter(host, [subscription('loop-1', 'pr-opened')]);

    host.commandResults.push(ghError(403, { 'X-Ratelimit-Remaining': '0', 'X-Ratelimit-Reset': '1750000000' }));
    await adapter.pollOnce();
    expect(adapter.debug().consecutiveFailures).toBe(1);
    expect(adapter.debug().rateLimitedUntilMs).toBe(1_750_000_000_000);

    host.commandResults.push(ghError(500));
    await adapter.pollOnce();
    expect(adapter.debug().consecutiveFailures).toBe(2);

    host.commandResults.push(ghOk([PR_A]));
    await adapter.pollOnce();
    expect(adapter.debug().consecutiveFailures).toBe(0);
  });

  it('slows down when the rate-limit window runs low even on success', async () => {
    const host = createFakeHost();
    const { adapter } = makeAdapter(host, [subscription('loop-1', 'pr-opened')]);
    host.commandResults.push(ghOk([PR_A], { 'X-Ratelimit-Remaining': '10', 'X-Ratelimit-Reset': '1750000000' }));
    await adapter.pollOnce();
    expect(adapter.debug().rateLimitedUntilMs).toBe(1_750_000_000_000);
    expect(host.logs.some((line) => line.includes('rate limit low'))).toBe(true);
  });
});

describe('occurrence extraction per kind', () => {
  const cursors = { 'ci-failed': '2026-03-01T00:00:00Z', 'ci-passed': '2026-03-01T00:00:00Z' };
  const runsEndpoint = GITHUB_ENDPOINTS.find((endpoint) => endpoint.id === 'workflow-runs')!;
  const eventsEndpoint = GITHUB_ENDPOINTS.find((endpoint) => endpoint.id === 'issue-events')!;
  const commentsEndpoint = GITHUB_ENDPOINTS.find((endpoint) => endpoint.id === 'review-comments')!;

  it('maps workflow-run conclusions onto ci-failed/ci-passed and skips others', () => {
    const body = {
      workflow_runs: [
        { id: 1, name: 'CI', conclusion: 'failure', head_branch: 'a', updated_at: '2026-03-02T00:00:00Z', pull_requests: [{ number: 7 }] },
        { id: 2, name: 'CI', conclusion: 'success', head_branch: 'b', updated_at: '2026-03-02T01:00:00Z' },
        { id: 3, name: 'CI', conclusion: 'cancelled', head_branch: 'c', updated_at: '2026-03-02T02:00:00Z' },
      ],
    };
    const both = extractOccurrences(runsEndpoint, body, new Set(['ci-failed', 'ci-passed']), cursors, '2026-03-03T00:00:00Z');
    expect(both.occurrences.map((o) => o.kind)).toEqual(['ci-failed', 'ci-passed']);
    expect(both.occurrences[0].dedupeKey).toBe('github:ci-failed:1:1');
    expect(both.occurrences[0].payload).toMatchObject({ workflow: 'CI', branch: 'a', prNumbers: [7] });

    // Demand scoping inside a shared endpoint: only the demanded kind fires.
    const onlyFailed = extractOccurrences(runsEndpoint, body, new Set(['ci-failed']), cursors, '2026-03-03T00:00:00Z');
    expect(onlyFailed.occurrences.map((o) => o.kind)).toEqual(['ci-failed']);
  });

  it('splits issue events into issue-labelled and review-requested', () => {
    const body = [
      { id: 5, event: 'labeled', created_at: '2026-03-02T00:00:00Z', label: { name: 'bug' }, issue: { number: 3, title: 'Broken', html_url: 'https://x/i/3' } },
      { id: 6, event: 'review_requested', created_at: '2026-03-02T01:00:00Z', requested_reviewer: { login: 'dan' }, issue: { number: 4, title: 'PR', pull_request: {} } },
      { id: 7, event: 'closed', created_at: '2026-03-02T02:00:00Z', issue: { number: 5 } },
    ];
    const known = { 'issue-labelled': '2026-03-01T00:00:00Z', 'review-requested': '2026-03-01T00:00:00Z' };
    const result = extractOccurrences(eventsEndpoint, body, new Set(['issue-labelled', 'review-requested']), known, '2026-03-03T00:00:00Z');
    expect(result.occurrences.map((o) => o.kind)).toEqual(['issue-labelled', 'review-requested']);
    expect(result.occurrences[0].payload).toMatchObject({ issueNumber: 3, label: 'bug' });
    expect(result.occurrences[1].payload).toMatchObject({ prNumber: 4, requestedReviewer: 'dan' });
  });

  it('extracts review comments with the PR number from the pull_request_url', () => {
    const body = [
      { id: 9, created_at: '2026-03-02T00:00:00Z', body: 'nit: rename', path: 'src/a.ts', user: { login: 'dan' }, pull_request_url: 'https://api.github.com/repos/o/r/pulls/12' },
    ];
    const result = extractOccurrences(commentsEndpoint, body, new Set(['review-comment']), { 'review-comment': '2026-03-01T00:00:00Z' }, '2026-03-03T00:00:00Z');
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].payload).toMatchObject({ prNumber: 12, author: 'dan', excerpt: 'nit: rename' });
  });

  it('splits the repo activity feed into pr-approved and default-branch main-updated (spec 15)', () => {
    const repoEventsEndpoint = GITHUB_ENDPOINTS.find((endpoint) => endpoint.id === 'repo-events')!;
    const body = [
      {
        id: '101', type: 'PullRequestReviewEvent', created_at: '2026-03-02T00:00:00Z', actor: { login: 'reviewer' },
        payload: { review: { state: 'approved', user: { login: 'reviewer' } }, pull_request: { number: 9, title: 'Fix', html_url: 'https://x/pr/9' } },
      },
      {
        id: '102', type: 'PullRequestReviewEvent', created_at: '2026-03-02T01:00:00Z',
        payload: { review: { state: 'changes_requested' }, pull_request: { number: 9 } }, // not an approval
      },
      {
        id: '103', type: 'PushEvent', created_at: '2026-03-02T02:00:00Z', actor: { login: 'dan' },
        payload: { ref: 'refs/heads/main', before: 'aaa', head: 'bbb', size: 2 },
      },
      {
        id: '104', type: 'PushEvent', created_at: '2026-03-02T03:00:00Z', actor: { login: 'dan' },
        payload: { ref: 'refs/heads/feature', before: 'ccc', head: 'ddd', size: 1 }, // not the default branch
      },
    ];
    const known = { 'pr-approved': '2026-03-01T00:00:00Z', 'main-updated': '2026-03-01T00:00:00Z' };
    const result = extractOccurrences(
      repoEventsEndpoint, body, new Set(['pr-approved', 'main-updated']), known, '2026-03-03T00:00:00Z', { defaultBranch: 'main' },
    );
    expect(result.occurrences.map((o) => o.kind)).toEqual(['pr-approved', 'main-updated']);
    expect(result.occurrences[0].payload).toMatchObject({ prNumber: 9, reviewer: 'reviewer', url: 'https://x/pr/9' });
    expect(result.occurrences[1].payload).toEqual({ branch: 'main', beforeSha: 'aaa', afterSha: 'bbb', commitCount: 2, pusher: 'dan' });

    // Without the default branch resolved, main-updated stays silent (never guesses).
    const withoutBranch = extractOccurrences(
      repoEventsEndpoint, body, new Set(['main-updated']), known, '2026-03-03T00:00:00Z', {},
    );
    expect(withoutBranch.occurrences).toEqual([]);
  });

  it('emits issue-opened for real issues only — the issues list mixes in pull requests', () => {
    const issuesEndpoint = GITHUB_ENDPOINTS.find((endpoint) => endpoint.id === 'issues')!;
    const body = [
      { id: 61, number: 61, title: 'A PR in disguise', created_at: '2026-03-02T01:00:00Z', user: { login: 'dan' }, pull_request: { url: 'x' } },
      { id: 60, number: 60, title: 'Real bug', created_at: '2026-03-02T00:00:00Z', user: { login: 'ann' }, labels: [{ name: 'bug' }], html_url: 'https://x/i/60' },
    ];
    const result = extractOccurrences(
      issuesEndpoint, body, new Set(['issue-opened']), { 'issue-opened': '2026-03-01T00:00:00Z' }, '2026-03-03T00:00:00Z',
    );
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].payload).toEqual({ number: 60, title: 'Real bug', author: 'ann', labels: ['bug'], url: 'https://x/i/60' });
  });
});

describe('default-branch resolution (spec 15)', () => {
  it('fetches the repo meta once under main-updated demand, persists it, and passes it to extraction', async () => {
    const host = createFakeHost();
    const { adapter, events } = makeAdapter(host, [subscription('loop-1', 'main-updated')]);

    // Poll 1: repo meta + baseline of the feed.
    host.commandResults.push(ghOk({ default_branch: 'trunk' }), ghOk([]));
    await adapter.pollOnce();
    expect(host.commands[0]).toMatch(/repos\/\{owner\}\/\{repo\}[^/]/);
    const state = await readAdapterState<GithubAdapterState>(host, 'github');
    expect(state?.defaultBranch).toBe('trunk');

    // Poll 2: no meta re-fetch; a trunk push now fires.
    host.commandResults.push(
      ghOk([{ id: '7', type: 'PushEvent', created_at: '2026-03-02T00:00:00Z', actor: { login: 'dan' }, payload: { ref: 'refs/heads/trunk', size: 1 } }]),
    );
    await adapter.pollOnce();
    expect(host.commands).toHaveLength(3); // 2 from poll 1, 1 from poll 2
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('github:main-updated');
    expect(events[0].payload).toMatchObject({ branch: 'trunk', pusher: 'dan' });
  });

  it('a failed meta fetch counts as a failed cycle and main-updated stays silent', async () => {
    const host = createFakeHost();
    const { adapter, events } = makeAdapter(host, [subscription('loop-1', 'main-updated')]);
    host.commandResults.push(ghError(500), ghOk([]));
    await adapter.pollOnce();
    expect(adapter.debug().consecutiveFailures).toBe(1);
    expect(events).toEqual([]);
    expect(host.logs.some((line) => line.includes('could not resolve the default branch'))).toBe(true);
  });
});
