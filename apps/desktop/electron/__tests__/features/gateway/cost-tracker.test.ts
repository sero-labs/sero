import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { CostTracker } from '@electron/features/gateway/server/cost-tracker';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-gateway-cost-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('gateway cost tracker config loading', () => {
  it('does not overwrite malformed config files and surfaces a load error', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'gateway-config.json');
    fs.writeFileSync(configPath, '{ malformed-json', 'utf8');

    const tracker = new CostTracker(configDir);

    expect(fs.readFileSync(configPath, 'utf8')).toBe('{ malformed-json');
    expect(tracker.getSummary().dailyLimit).toBe(50);
    expect(tracker.getConfigLoadError()).toContain('Invalid JSON');
  });

  it('writes defaults when config file is missing', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'gateway-config.json');

    const tracker = new CostTracker(configDir);

    expect(fs.existsSync(configPath)).toBe(true);
    expect(tracker.getConfigLoadError()).toBeNull();
    expect(tracker.getSummary().dailyLimit).toBe(50);

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(persisted.maxCostPerSession).toBe(5);
    expect(persisted.maxCostPerDay).toBe(50);
    expect(persisted.maxConcurrentSessions).toBe(10);
  });
});

describe('gateway usage report', () => {
  it('reports nothing for a session that never ran', () => {
    const tracker = new CostTracker(makeTempDir());

    const report = tracker.getUsage(['never-ran']);

    expect(report.sessions).toEqual([]);
    expect(report.totals).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
  });

  it('counts one request per recorded response', () => {
    const tracker = new CostTracker(makeTempDir());
    tracker.recordUsage('s1', 'claude-opus-4', 1000, 500);
    tracker.recordUsage('s1', 'claude-opus-4', 2000, 250);

    const report = tracker.getUsage(['s1']);

    expect(report.sessions).toHaveLength(1);
    expect(report.sessions[0]?.requests).toBe(2);
    expect(report.sessions[0]?.inputTokens).toBe(3000);
    expect(report.sessions[0]?.outputTokens).toBe(750);
    expect(report.sessions[0]?.totalTokens).toBe(3750);
    expect(report.sessions[0]?.costUsd).toBeGreaterThan(0);
  });

  it('sums the totals over the requested sessions only', () => {
    const tracker = new CostTracker(makeTempDir());
    tracker.recordUsage('mine', 'claude-opus-4', 1000, 100);
    tracker.recordUsage('theirs', 'claude-opus-4', 9000, 900);

    const report = tracker.getUsage(['mine']);

    expect(report.sessions.map((session) => session.sessionId)).toEqual(['mine']);
    expect(report.totals.inputTokens).toBe(1000);
    expect(report.totals.requests).toBe(1);
  });

  it('sorts sessions by cost, dearest first', () => {
    const tracker = new CostTracker(makeTempDir());
    tracker.recordUsage('cheap', 'claude-opus-4', 100, 10);
    tracker.recordUsage('dear', 'claude-opus-4', 100_000, 10_000);

    const report = tracker.getUsage(['cheap', 'dear']);

    expect(report.sessions.map((session) => session.sessionId)).toEqual(['dear', 'cheap']);
  });

  it('reports the daily cost alongside the session totals', () => {
    const tracker = new CostTracker(makeTempDir());
    tracker.recordUsage('s1', 'claude-opus-4', 1000, 100);

    const report = tracker.getUsage(['s1']);

    expect(report.dailyCostUsd).toBeCloseTo(report.totals.costUsd, 10);
    expect(report.dailyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lists every tracked session for an owner token', () => {
    const tracker = new CostTracker(makeTempDir());
    tracker.recordUsage('a', 'claude-opus-4', 10, 1);
    tracker.recordUsage('b', 'claude-opus-4', 10, 1);

    expect(tracker.trackedSessionIds().sort()).toEqual(['a', 'b']);
  });
});
