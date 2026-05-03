/**
 * System category checks: OS, arch, disk, memory.
 */

import os from 'os';
import path from 'path';
import { registerDoctorCheck } from '../registry';
import type { DoctorCheck } from '../types';
import { makeResult, runCommand } from './helpers';

const MIN_MACOS_MAJOR = 13;
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const LOW_MEMORY_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB

const platformCheck: DoctorCheck = {
  id: 'system.os.platform',
  category: 'system',
  async run(): Promise<ReturnType<typeof makeResult>> {
    const start = Date.now();
    const platform = os.platform();
    if (platform === 'darwin') {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'macOS detected.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: `Sero v1 is designed for macOS. Detected ${platform}; some checks may not apply.`,
      start,
    });
  },
};

const versionCheck: DoctorCheck = {
  id: 'system.os.version',
  category: 'system',
  async run() {
    const start = Date.now();
    const release = os.release();
    const major = Number.parseInt(release.split('.')[0] ?? '', 10);
    if (Number.isFinite(major) && os.platform() === 'darwin' && major < MIN_MACOS_MAJOR + 9) {
      // Darwin kernel major maps roughly: 22 ≈ macOS 13, 23 ≈ 14, 24 ≈ 15.
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: `Kernel ${release} may be older than Sero's minimum supported macOS.`,
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `Kernel ${release}`,
      start,
    });
  },
};

const archCheck: DoctorCheck = {
  id: 'system.arch',
  category: 'system',
  async run() {
    const start = Date.now();
    if (process.arch === 'arm64') {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Apple Silicon (arm64).',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: `Arch ${process.arch}: Sero targets arm64 first; expect reduced performance.`,
      start,
    });
  },
};

const diskCheck: DoctorCheck = {
  id: 'system.disk.free',
  category: 'system',
  async run() {
    const start = Date.now();
    const target = path.join(os.homedir(), '.sero-ui');
    const result = await runCommand('df', ['-k', target], { timeoutMs: 2_000 });
    if (!result.ok) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: `Could not query free disk space: ${result.error ?? result.stderr}`,
        start,
      });
    }
    // Parse the second line of df output: "Filesystem 1024-blocks Used Available Capacity Mounted on"
    const lines = result.stdout.trim().split('\n');
    const dataLine = lines[lines.length - 1] ?? '';
    const cols = dataLine.split(/\s+/);
    const availableKb = Number.parseInt(cols[3] ?? '', 10);
    if (!Number.isFinite(availableKb)) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: 'Could not parse df output.',
        start,
      });
    }
    const availableBytes = availableKb * 1024;
    const gb = (availableBytes / 1024 / 1024 / 1024).toFixed(1);
    if (availableBytes < MIN_FREE_BYTES) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'fail',
        message: `Only ${gb} GB free under ~/.sero-ui (need ≥ 2 GB).`,
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `${gb} GB free under ~/.sero-ui.`,
      start,
    });
  },
};

const memoryCheck: DoctorCheck = {
  id: 'system.memory',
  category: 'system',
  async run() {
    const start = Date.now();
    const free = os.freemem();
    const gb = (free / 1024 / 1024 / 1024).toFixed(1);
    if (free < LOW_MEMORY_BYTES) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: `Free memory ${gb} GB is below 1 GB threshold.`,
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `Free memory ${gb} GB.`,
      start,
    });
  },
};

export function registerSystemChecks(): void {
  registerDoctorCheck(platformCheck);
  registerDoctorCheck(versionCheck);
  registerDoctorCheck(archCheck);
  registerDoctorCheck(diskCheck);
  registerDoctorCheck(memoryCheck);
}
