import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertNoAuditRegression,
  isReleaseEligible,
  selectEligibleNpmRelease,
  validateRuntimePins,
} from '../../../../scripts/runtime-tools/update-runtime-tools.mjs';
import {
  applyObservationWindow,
  isRoutineUpdate,
  renderRuntimeUpdateReport,
  type RuntimeUpdateCandidate,
} from '../../../../scripts/runtime-tools/runtime-tool-sources.mjs';

const desktopRoot = path.resolve(__dirname, '../../../..');

describe('runtime tool update policy', () => {
  it('waits for the full seven-day release window', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    expect(isReleaseEligible('2026-08-17T12:00:00.001Z', now, 7)).toBe(false);
    expect(isReleaseEligible('2026-08-17T12:00:00.000Z', now, 7)).toBe(true);
  });

  it('allows vulnerability fixes but rejects severity regressions', () => {
    const baseline = auditReport({ critical: 0, high: 4, moderate: 1, low: 0, info: 0 });
    expect(() => assertNoAuditRegression(
      baseline,
      auditReport({ critical: 0, high: 3, moderate: 2, low: 0, info: 0 }),
    )).not.toThrow();
    expect(() => assertNoAuditRegression(
      baseline,
      auditReport({ critical: 0, high: 5, moderate: 0, low: 0, info: 0 }),
    )).toThrow('regressed at high: 4 -> 5');
    expect(() => assertNoAuditRegression(
      baseline,
      auditReport({ critical: 0, high: 4, moderate: 2, low: 0, info: 0 }),
    )).toThrow('regressed at moderate: 5 -> 6');
  });

  it('selects the newest stable release that completed the waiting period', () => {
    const metadata = {
      versions: {
        '1.1.0': { dist: { integrity: 'old' } },
        '1.2.0': { dist: { integrity: 'eligible' } },
        '1.3.0': { dist: { integrity: 'young' } },
        '2.0.0-beta.1': { dist: { integrity: 'prerelease' } },
      },
      time: {
        '1.1.0': '2026-08-01T00:00:00.000Z',
        '1.2.0': '2026-08-10T00:00:00.000Z',
        '1.3.0': '2026-08-20T00:00:00.000Z',
        '2.0.0-beta.1': '2026-08-01T00:00:00.000Z',
      },
    };

    expect(selectEligibleNpmRelease({
      metadata,
      currentVersion: '1.1.0',
      now: new Date('2026-08-24T00:00:00.000Z'),
      minimumReleaseAgeDays: 7,
    })).toBe('1.2.0');
  });

  it('holds major releases for the separate breaking-update run', () => {
    const metadata = {
      versions: { '1.2.0': {}, '2.0.0': {} },
      time: {
        '1.2.0': '2026-08-01T00:00:00.000Z',
        '2.0.0': '2026-08-01T00:00:00.000Z',
      },
    };
    const options = {
      metadata,
      currentVersion: '1.1.0',
      now: new Date('2026-08-24T00:00:00.000Z'),
      minimumReleaseAgeDays: 7,
      routineUpdates: 'minor' as const,
    };

    expect(selectEligibleNpmRelease(options)).toBe('1.2.0');
    expect(selectEligibleNpmRelease({ ...options, updateMode: 'breaking' })).toBe('2.0.0');
  });

  it('treats a minor update for a zero-major package as breaking when configured for patches', () => {
    const metadata = {
      versions: { '0.27.3': {}, '0.28.0': {}, '0.34.0': {} },
      time: {
        '0.27.3': '2026-08-01T00:00:00.000Z',
        '0.28.0': '2026-08-01T00:00:00.000Z',
        '0.34.0': '2026-08-01T00:00:00.000Z',
      },
    };
    const options = {
      metadata,
      currentVersion: '0.27.0',
      now: new Date('2026-08-24T00:00:00.000Z'),
      minimumReleaseAgeDays: 7,
      routineUpdates: 'patch' as const,
    };

    expect(selectEligibleNpmRelease(options)).toBe('0.27.3');
    expect(selectEligibleNpmRelease({ ...options, updateMode: 'breaking' })).toBe('0.34.0');
    expect(isRoutineUpdate('0.27.3', '0.28.0', 'patch')).toBe(false);
  });

  it('puts ready and waiting updates in the durable status report', () => {
    const candidates: RuntimeUpdateCandidate[] = [
      updateCandidate({ label: 'agent-browser', eligible: true, mode: 'breaking' }),
      updateCandidate({ label: 'Node.js', eligible: false, mode: 'routine' }),
    ];
    const report = renderRuntimeUpdateReport(
      { npm: {}, policy: { minimumReleaseAgeDays: 7 } },
      candidates,
      new Date('2026-08-24T12:00:00.000Z'),
    );

    expect(report).toContain('| agent-browser | `1.0.0` | `2.0.0` | breaking | ready |');
    expect(report).toContain('| Node.js | `1.0.0` | `2.0.0` | routine | waiting until 2026-08-31 |');
  });

  it('restarts the waiting period when a candidate identity changes', () => {
    const first = updateCandidate({ eligible: true, eligibleAt: '2026-08-01T00:00:00.000Z' });
    const observations = applyObservationWindow([first], {}, new Date('2026-08-10T00:00:00.000Z'), 7);
    expect(first.eligible).toBe(false);
    expect(first.eligibleAt).toBe('2026-08-17T00:00:00.000Z');

    const unchanged = updateCandidate({ eligible: true, eligibleAt: '2026-08-01T00:00:00.000Z' });
    applyObservationWindow([unchanged], observations, new Date('2026-08-17T00:00:00.000Z'), 7);
    expect(unchanged.eligible).toBe(true);

    const changed = updateCandidate({
      eligible: true,
      eligibleAt: '2026-08-01T00:00:00.000Z',
      details: { digest: 'replacement' },
    });
    applyObservationWindow([changed], observations, new Date('2026-08-17T00:00:00.000Z'), 7);
    expect(changed.eligible).toBe(false);
    expect(changed.eligibleAt).toBe('2026-08-24T00:00:00.000Z');
  });

  it('validates exact package integrities and consumed container digests', async () => {
    const pins = JSON.parse(await fs.readFile(path.join(desktopRoot, 'runtime-tools/pins.json'), 'utf8'));
    await expect(validateRuntimePins({ pins, now: new Date('2026-08-24T12:00:00.000Z') })).resolves.toBeUndefined();
  });

  it('rejects a young pin without a recorded urgent-security reason', async () => {
    const pins = JSON.parse(await fs.readFile(path.join(desktopRoot, 'runtime-tools/pins.json'), 'utf8'));
    pins.npm.playwright.releasedAt = '2026-08-24T11:00:00.000Z';
    await expect(validateRuntimePins({ pins, now: new Date('2026-08-24T12:00:00.000Z') }))
      .rejects.toThrow('has no recorded security override');
    pins.securityOverrides.push({ tool: 'playwright', version: pins.npm.playwright.version, reason: 'CVE-2026-1234 active exploitation' });
    await expect(validateRuntimePins({ pins, now: new Date('2026-08-24T12:00:00.000Z') })).resolves.toBeUndefined();
  });
});

function updateCandidate(overrides: Partial<RuntimeUpdateCandidate>): RuntimeUpdateCandidate {
  return {
    key: 'tool',
    label: 'Tool',
    source: 'test',
    currentVersion: '1.0.0',
    version: '2.0.0',
    releasedAt: '2026-08-24T00:00:00.000Z',
    eligibleAt: '2026-08-31T00:00:00.000Z',
    eligible: false,
    mode: 'routine',
    details: {},
    ...overrides,
  };
}

function auditReport(vulnerabilities: Record<'critical' | 'high' | 'moderate' | 'low' | 'info', number>) {
  return { metadata: { vulnerabilities } };
}
