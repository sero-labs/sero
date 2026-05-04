/**
 * Runtime — Apple Container checks.
 *
 * The engine deliberately does not import from `features/container` to
 * preserve the engine isolation invariant. Instead we re-implement the
 * minimal CLI probe directly.
 */

import { accessSync, constants } from 'fs';
import { registerDoctorCheck } from '../registry';
import { containerStartRepair } from '../repairs';
import type { DoctorCheck } from '../types';
import { makeResult, runCommand } from './helpers';

const CONTAINER_BIN = '/usr/local/bin/container';

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const cliCheck: DoctorCheck = {
  id: 'runtime.container.cli',
  category: 'runtime',
  async run() {
    const start = Date.now();
    if (!isExecutable(CONTAINER_BIN)) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: 'Apple Container CLI not installed (optional for host mode).',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Apple Container CLI present.',
      start,
    });
  },
};

const versionCheck: DoctorCheck = {
  id: 'runtime.container.version',
  category: 'runtime',
  async run(ctx) {
    const start = Date.now();
    if (!isExecutable(CONTAINER_BIN)) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Container CLI not installed; version check skipped.',
        start,
      });
    }
    const result = await runCommand(CONTAINER_BIN, ['--version'], {
      timeoutMs: 2_000,
      signal: ctx.signal,
    });
    if (!result.ok) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'fail',
        message: `container --version failed: ${result.error ?? result.stderr}`,
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: result.stdout.trim().split('\n')[0] ?? 'Unknown version',
      start,
    });
  },
};

const daemonCheck: DoctorCheck = {
  id: 'runtime.container.daemon',
  category: 'runtime',
  repair: containerStartRepair,
  async run(ctx) {
    const start = Date.now();
    if (!isExecutable(CONTAINER_BIN)) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Container CLI not installed; daemon check skipped.',
        start,
      });
    }
    const result = await runCommand(CONTAINER_BIN, ['system', 'status'], {
      timeoutMs: 5_000,
      signal: ctx.signal,
    });
    if (result.ok && result.stdout.includes('running')) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Container system is running.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: 'Container system is not running.',
      fix: {
        kind: 'repair',
        repairId: containerStartRepair.id,
        description: containerStartRepair.description,
        destructive: containerStartRepair.destructive,
      },
      start,
    });
  },
};

const createCheck: DoctorCheck = {
  id: 'runtime.container.create',
  category: 'runtime',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    if (!isExecutable(CONTAINER_BIN)) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Container CLI not installed; create probe skipped.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Container create probe deferred to v2 (would consume real resources).',
      start,
    });
  },
};

const execCheck: DoctorCheck = {
  id: 'runtime.container.exec',
  category: 'runtime',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Container exec probe deferred to v2.',
      start,
    });
  },
};

const mountCheck: DoctorCheck = {
  id: 'runtime.container.mount',
  category: 'runtime',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Container mount probe deferred to v2.',
      start,
    });
  },
};

export function registerRuntimeContainerChecks(): void {
  registerDoctorCheck(cliCheck);
  registerDoctorCheck(versionCheck);
  registerDoctorCheck(daemonCheck);
  registerDoctorCheck(createCheck);
  registerDoctorCheck(execCheck);
  registerDoctorCheck(mountCheck);
}
