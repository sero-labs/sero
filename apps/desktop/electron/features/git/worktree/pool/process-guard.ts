import { execFile } from 'node:child_process';

import {
  seroOwnedProcesses,
  type OwnedShutdownFailure,
  type SeroOwnedProcessRegistry,
} from './owned-processes';

export interface DetectedSlotProcess {
  pid: number;
  command: string | null;
}

export type ProcessDetectionResult =
  | { status: 'clear' }
  | { status: 'in-use'; processes: DetectedSlotProcess[] }
  | { status: 'unverifiable'; reason: string };

export interface SlotProcessDetector {
  readonly platform: NodeJS.Platform;
  detect(root: string): Promise<ProcessDetectionResult>;
}

export type ProcessGuardResult =
  | { status: 'safe'; stoppedOwned: number }
  | { status: 'in-use'; reason: string }
  | { status: 'unverifiable'; reason: string };

interface ProcessGuardOptions {
  owned?: SeroOwnedProcessRegistry;
  detector?: SlotProcessDetector;
  ownedShutdownTimeoutMs?: number;
}

interface ExecFailure extends Error {
  code?: string | number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

/** Adapter-only parser for lsof's machine-readable field output. */
export function parseLsofFields(output: string): DetectedSlotProcess[] {
  const found = new Map<number, DetectedSlotProcess>();
  let currentPid: number | null = null;
  for (const line of output.split('\n')) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') {
      const pid = Number.parseInt(value, 10);
      currentPid = Number.isInteger(pid) && pid > 0 ? pid : null;
      if (currentPid) found.set(currentPid, { pid: currentPid, command: null });
    } else if (field === 'c' && currentPid) {
      found.set(currentPid, { pid: currentPid, command: value || null });
    }
  }
  return [...found.values()];
}

/** macOS and Linux adapter. Windows fails closed until it has a native adapter. */
export class LsofProcessDetector implements SlotProcessDetector {
  readonly platform: NodeJS.Platform;

  constructor(platform: NodeJS.Platform = process.platform) {
    this.platform = platform;
  }

  detect(root: string): Promise<ProcessDetectionResult> {
    if (this.platform !== 'darwin' && this.platform !== 'linux') {
      return Promise.resolve({
        status: 'unverifiable',
        reason: `Process detection is not supported on ${this.platform}.`,
      });
    }
    return new Promise((resolve) => {
      execFile('lsof', ['-nP', '-w', '-Fpc', '+D', root], {
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        const processes = parseLsofFields(stdout);
        if (processes.length > 0) {
          resolve({ status: 'in-use', processes });
          return;
        }
        if (!error && stderr.trim().length === 0) {
          resolve({ status: 'clear' });
          return;
        }
        const failure = error as ExecFailure | null;
        // lsof uses exit 1 for "no files found". No stderr and no records is a
        // successful empty query, not a detection failure.
        if (!failure?.killed && stderr.trim().length === 0
          && (failure?.code === 1 || failure?.code === '1'
            || failure?.message.startsWith('Command failed: lsof '))) {
          resolve({ status: 'clear' });
          return;
        }
        const detail = stderr.trim() || failure?.message || 'lsof failed';
        resolve({ status: 'unverifiable', reason: detail });
      });
    });
  }
}

export class WorktreeProcessGuard {
  private readonly owned: SeroOwnedProcessRegistry;
  private readonly detector: SlotProcessDetector;
  private readonly ownedShutdownTimeoutMs: number;

  constructor(options: ProcessGuardOptions = {}) {
    this.owned = options.owned ?? seroOwnedProcesses;
    this.detector = options.detector ?? new LsofProcessDetector();
    this.ownedShutdownTimeoutMs = options.ownedShutdownTimeoutMs ?? 10_000;
  }

  async prepare(root: string): Promise<ProcessGuardResult> {
    const owned = this.owned.listRootedIn(root);
    const failures = await this.stopOwnedWithTimeout(root);
    if (failures.length > 0) {
      const first = failures[0];
      return {
        status: 'unverifiable',
        reason: `Sero could not confirm shutdown of ${first.kind} ${first.id}: ${first.reason}`,
      };
    }

    let detection: ProcessDetectionResult;
    try {
      detection = await this.detector.detect(root);
    } catch (error) {
      return {
        status: 'unverifiable',
        reason: `Process detection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (detection.status === 'clear') return { status: 'safe', stoppedOwned: owned.length };
    if (detection.status === 'unverifiable') return detection;
    const sample = detection.processes.slice(0, 3)
      .map((entry) => `${entry.pid}${entry.command ? ` (${entry.command})` : ''}`)
      .join(', ');
    return {
      status: 'in-use',
      reason: `The checkout is still used by process ${sample}. Foreign processes were not terminated.`,
    };
  }

  private async stopOwnedWithTimeout(root: string): Promise<OwnedShutdownFailure[]> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.owned.stopRootedIn(root),
        new Promise<OwnedShutdownFailure[]>((resolve) => {
          timeout = setTimeout(() => resolve([{
            id: 'shutdown-timeout',
            kind: 'command',
            reason: `owned shutdown was not confirmed within ${this.ownedShutdownTimeoutMs}ms`,
          }]), this.ownedShutdownTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

export const defaultWorktreeProcessGuard = new WorktreeProcessGuard();
