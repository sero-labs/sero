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
    expect(events[0]).toBe('check-start');
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
});
