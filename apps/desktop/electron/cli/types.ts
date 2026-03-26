import type { ContainerManager } from '../container';
import type { WorkspaceManager } from '../workspace/manager';

export type CliSource = 'tool' | 'bash' | 'terminal';

export interface CliInvocation {
  workspaceId: string;
  sessionId: string | null;
  turnId: string | null;
  source: CliSource;
  signal?: AbortSignal;
}

export interface CliResult {
  output: string;
  exitCode?: number;
}

export interface CliParam {
  name: string;
  description: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  default?: unknown;
}

export interface CliCommandContext {
  workspaceId: string;
  cwd: string;
  invocation: CliInvocation;
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
}

export interface CliCommand {
  name: string;
  summary: string;
  help?: string;
  params?: CliParam[];
  execute: (args: string[], context: CliCommandContext) => Promise<CliResult>;
  source?: 'app' | 'ipc' | 'builtin';
  group?: string;
  hidden?: boolean;
}

export interface CliResolvedCommand {
  command: CliCommand;
  args: string[];
  tokens: string[];
}
