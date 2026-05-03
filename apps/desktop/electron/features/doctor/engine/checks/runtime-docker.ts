/**
 * Runtime — Docker checks (optional).
 *
 * Absent Docker passes with an "optional" message rather than failing.
 */

import { registerDoctorCheck } from '../registry';
import type { DoctorCheck } from '../types';
import { makeResult, runCommand } from './helpers';

async function whichDocker(signal?: AbortSignal): Promise<string | null> {
  const result = await runCommand('which', ['docker'], {
    timeoutMs: 1_500,
    signal,
  });
  if (!result.ok) return null;
  const path = result.stdout.trim();
  return path || null;
}

const cliCheck: DoctorCheck = {
  id: 'runtime.docker.cli',
  category: 'runtime',
  async run(ctx) {
    const start = Date.now();
    const path = await whichDocker(ctx.signal);
    if (!path) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Docker not installed (optional).',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `Docker CLI at ${path}.`,
      start,
    });
  },
};

const daemonCheck: DoctorCheck = {
  id: 'runtime.docker.daemon',
  category: 'runtime',
  async run(ctx) {
    const start = Date.now();
    const path = await whichDocker(ctx.signal);
    if (!path) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Docker not installed (optional).',
        start,
      });
    }
    const result = await runCommand('docker', ['info'], {
      timeoutMs: 2_500,
      signal: ctx.signal,
    });
    if (result.ok) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Docker daemon is responding.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: 'Docker installed but daemon is not running.',
      start,
    });
  },
};

const runCheck: DoctorCheck = {
  id: 'runtime.docker.run',
  category: 'runtime',
  slow: true,
  async run(ctx) {
    const start = Date.now();
    const path = await whichDocker(ctx.signal);
    if (!path) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Docker not installed (optional).',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Docker run probe deferred (would pull images).',
      start,
    });
  },
};

const portCheck: DoctorCheck = {
  id: 'runtime.docker.port',
  category: 'runtime',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Docker port probe deferred to v2.',
      start,
    });
  },
};

export function registerRuntimeDockerChecks(): void {
  registerDoctorCheck(cliCheck);
  registerDoctorCheck(daemonCheck);
  registerDoctorCheck(runCheck);
  registerDoctorCheck(portCheck);
}
