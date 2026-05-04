import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetRegistryForTests, registerDoctorCheck } from '@electron/features/doctor/engine/registry';
import { runDoctor } from '@electron/features/doctor/engine/runner';
import type { DoctorCheck, DoctorContext } from '@electron/features/doctor/engine/types';

function makePassCheck(id: string, slow = false): DoctorCheck {
  return {
    id,
    category: 'system',
    slow,
    async run(ctx: DoctorContext) {
      ctx.signal.aborted; // Touch signal to prove we have it.
      return {
        id,
        category: 'system',
        status: 'pass',
        message: `${id} passed`,
        durationMs: 0,
      };
    },
  };
}

function makeThrowingCheck(id: string): DoctorCheck {
  return {
    id,
    category: 'system',
    async run() {
      throw new Error('boom');
    },
  };
}

function makeSlowCheck(id: string, ms: number): DoctorCheck {
  return {
    id,
    category: 'system',
    async run() {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return {
        id,
        category: 'system',
        status: 'pass',
        message: 'slow ok',
        durationMs: 0,
      };
    },
  };
}

beforeEach(() => {
  __resetRegistryForTests();
});

afterEach(() => {
  __resetRegistryForTests();
});

describe('runner.runDoctor', () => {
  it('runs all registered checks', async () => {
    registerDoctorCheck(makePassCheck('a.one'));
    registerDoctorCheck(makePassCheck('a.two'));
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    const ids = report.results.map((r) => r.id).sort();
    expect(ids).toEqual(['a.one', 'a.two']);
  });

  it('quick mode skips slow checks', async () => {
    registerDoctorCheck(makePassCheck('a.fast'));
    registerDoctorCheck(makePassCheck('a.slow', true));
    const report = await runDoctor({
      mode: 'quick',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    const ids = report.results.map((r) => r.id);
    expect(ids).toContain('a.fast');
    expect(ids).not.toContain('a.slow');
  });

  it('thrown checks become synthetic fail results', async () => {
    registerDoctorCheck(makeThrowingCheck('a.bad'));
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    const result = report.results.find((r) => r.id === 'a.bad');
    expect(result?.status).toBe('fail');
    expect(result?.message).toContain('boom');
  });

  it('per-check timeout produces a synthetic fail', async () => {
    registerDoctorCheck(makeSlowCheck('a.slow', 200));
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
      perCheckTimeoutMs: 50,
    });
    const result = report.results.find((r) => r.id === 'a.slow');
    expect(result?.status).toBe('fail');
    expect(result?.message).toContain('timed out');
  });

  it('streams progress events', async () => {
    registerDoctorCheck(makePassCheck('a.one'));
    const events: string[] = [];
    await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
      onProgress: (event) => events.push(event.kind),
    });
    expect(events[0]).toBe('all-start');
    expect(events[1]).toBe('check-start');
    expect(events).toContain('check-done');
    expect(events[events.length - 1]).toBe('all-done');
  });

  it('safe mode skips needsBootedApp checks', async () => {
    const liveCheck: DoctorCheck = {
      id: 'a.live',
      category: 'workspace',
      needsBootedApp: true,
      async run() {
        return {
          id: 'a.live',
          category: 'workspace',
          status: 'pass',
          message: 'ok',
          durationMs: 0,
        };
      },
    };
    registerDoctorCheck(liveCheck);
    registerDoctorCheck(makePassCheck('a.offline'));
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'safe',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    const ids = report.results.map((r) => r.id);
    expect(ids).not.toContain('a.live');
    expect(ids).toContain('a.offline');
  });

  it('sorts results by id deterministically', async () => {
    registerDoctorCheck(makePassCheck('z.last'));
    registerDoctorCheck(makePassCheck('a.first'));
    registerDoctorCheck(makePassCheck('m.mid'));
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    expect(report.results.map((r) => r.id)).toEqual(['a.first', 'm.mid', 'z.last']);
  });

  it('global budget cuts off unfinished checks with synthetic fail results', async () => {
    registerDoctorCheck(makePassCheck('a.fast'));
    registerDoctorCheck(makeSlowCheck('a.slow', 500));
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
      perCheckTimeoutMs: 1_000,
      globalBudgetMs: 50,
    });
    const slow = report.results.find((r) => r.id === 'a.slow');
    expect(slow?.status).toBe('fail');
    expect(slow?.message).toMatch(/global budget/i);
    // The fast check is still allowed to complete.
    const fast = report.results.find((r) => r.id === 'a.fast');
    expect(fast?.status).toBe('pass');
  });

  it('echoes the caller-supplied runId on every event and on the report', async () => {
    registerDoctorCheck(makePassCheck('a.one'));
    const events: Array<{ kind: string; runId: string }> = [];
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
      runId: 'caller-supplied-run',
      onProgress: (event) => events.push({ kind: event.kind, runId: event.runId }),
    });
    expect(report.runId).toBe('caller-supplied-run');
    for (const event of events) {
      expect(event.runId).toBe('caller-supplied-run');
    }
  });

  it('drops late check-done events and results after the budget closes the run', async () => {
    let lateResolved = 0;
    const lateCheck: DoctorCheck = {
      id: 'a.late',
      category: 'system',
      // Note: this check intentionally ignores ctx.signal to simulate a
      // straggler that doesn't honour cancellation. The runner must
      // still keep the event sequence well-formed.
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        lateResolved += 1;
        return {
          id: 'a.late',
          category: 'system',
          status: 'pass',
          message: 'I finished after the budget',
          durationMs: 0,
        };
      },
    };
    registerDoctorCheck(lateCheck);

    const events: Array<{ kind: string; id?: string; status?: string }> = [];
    const report = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
      perCheckTimeoutMs: 1_000,
      globalBudgetMs: 30,
      onProgress: (event) => {
        if (event.kind === 'check-done') {
          events.push({ kind: event.kind, id: event.result.id, status: event.result.status });
        } else {
          events.push({ kind: event.kind });
        }
      },
    });

    // The synthetic budget-fail must be the only check-done for `a.late`,
    // and it must arrive before all-done.
    const lateDones = events.filter((e) => e.kind === 'check-done' && e.id === 'a.late');
    expect(lateDones).toHaveLength(1);
    expect(lateDones[0].status).toBe('fail');

    const allDoneIndex = events.findIndex((e) => e.kind === 'all-done');
    expect(allDoneIndex).toBeGreaterThan(0);
    // No check-done events appear after all-done, even after the slow
    // check actually resolves.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(lateResolved).toBe(1);
    const trailing = events.slice(allDoneIndex + 1).filter((e) => e.kind === 'check-done');
    expect(trailing).toHaveLength(0);

    // The report contains exactly one entry for `a.late` and it's the
    // synthetic fail — the late real result is not appended.
    const lateReportRows = report.results.filter((r) => r.id === 'a.late');
    expect(lateReportRows).toHaveLength(1);
    expect(lateReportRows[0].status).toBe('fail');
  });

  it('aborts ctx.signal once the global budget elapses', async () => {
    let signalSeenAborted = false;
    const watcher: DoctorCheck = {
      id: 'a.watcher',
      category: 'system',
      async run(ctx: DoctorContext) {
        // Wait long enough to outlive the budget, then check the signal.
        await new Promise((resolve) => setTimeout(resolve, 100));
        signalSeenAborted = ctx.signal.aborted;
        return {
          id: 'a.watcher',
          category: 'system',
          status: 'pass',
          message: 'observed',
          durationMs: 0,
        };
      },
    };
    registerDoctorCheck(watcher);
    await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
      perCheckTimeoutMs: 1_000,
      globalBudgetMs: 20,
    });
    // Allow the slow check to actually resolve so its post-budget
    // observation runs.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(signalSeenAborted).toBe(true);
  });

  it('mints a runId when the caller does not supply one', async () => {
    registerDoctorCheck(makePassCheck('a.one'));
    const reportA = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    const reportB = await runDoctor({
      mode: 'full',
      contextMode: 'in-app',
      profile: null,
      allProfiles: [],
      seroVersion: '0.0.0',
    });
    expect(reportA.runId).toBeTruthy();
    expect(reportB.runId).toBeTruthy();
    expect(reportA.runId).not.toBe(reportB.runId);
  });
});
