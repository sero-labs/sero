import type { IPty } from 'node-pty';
import type { ExecResult } from '@electron/features/container/core/types';
import type {
  WorkspaceRuntimeKind,
  WorkspaceRuntimeResolution,
} from '@electron/features/workspace/runtime-resolution';

export type RuntimeProviderId = 'host' | 'apple-container' | 'openshell-local';
export type RuntimeActualKind = WorkspaceRuntimeKind;
export type RuntimeHealthStatus = 'ready' | 'fallback' | 'unavailable';

export interface RuntimeCapabilities {
  exec: boolean;
  interactiveTerminal: boolean;
  directFileRead: boolean;
  directFileWrite: boolean;
  fileUpload: boolean;
  fileDownload: boolean;
  managedDevServers: boolean;
  browserAutomation: boolean;
  portDiscovery: boolean;
  portForward: boolean;
  logStream: boolean;
}

export interface RuntimeHealth {
  providerId: RuntimeProviderId;
  status: RuntimeHealthStatus;
  message?: string;
}

export interface RuntimeExecOptions {
  cwd: string;
  timeoutMs?: number;
  isolated?: boolean;
}

export interface RuntimeTerminalInput {
  terminalId: string;
  cols?: number;
  rows?: number;
}

export interface RuntimeTerminalSession {
  pty: IPty;
  runtime: 'container' | 'host';
  fallbackReason?: string;
}

export interface WorkspaceRuntimeFacade {
  workspaceId: string;
  workspacePath: string;
  providerId: RuntimeProviderId;
  actualRuntime: RuntimeActualKind;
  resolution: WorkspaceRuntimeResolution;
  capabilities: RuntimeCapabilities;
  fallbackReason?: string;
  health(): Promise<RuntimeHealth>;
  exec(command: string, options: RuntimeExecOptions): Promise<ExecResult>;
  createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession>;
}
