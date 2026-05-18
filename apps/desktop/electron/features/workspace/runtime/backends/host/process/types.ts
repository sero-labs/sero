import type { RuntimeExecFileInput, RuntimeExecResult } from '../../../types';

export type HostProcessSignal = 'TERM' | 'KILL';

export type HostProcessExecFile = (input: RuntimeExecFileInput) => Promise<RuntimeExecResult>;

export interface HostProcessAdapter {
  descendantPids(rootPid: number): Promise<number[]>;
  listeningPort(pids: number[]): Promise<number | null>;
  listenerPids(port: number): Promise<number[]>;
  killPids(signal: HostProcessSignal, pids: number[]): Promise<void>;
}

export interface HostProcessAdapterOptions {
  platform?: NodeJS.Platform;
  execFile: HostProcessExecFile;
}
