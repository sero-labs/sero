import type { ContainerManager } from '../../features/container';
import type { WorkspaceManager } from '../../features/workspace/manager';

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

export interface CliCommandUpdate {
  content: Array<
    { type: 'text'; text: string } |
    { type: 'image'; data: string; mimeType: string }
  >;
  details?: unknown;
}

export interface CliCommand {
  name: string;
  summary: string;
  help?: string;
  params?: CliParam[];
  execute: (
    args: string[],
    context: CliCommandContext,
    onUpdate?: (update: CliCommandUpdate) => void,
  ) => Promise<CliResult>;
  source?: 'app' | 'ipc' | 'builtin';
  group?: string;
  hidden?: boolean;
  /** Optional per-command timeout override for non-terminal invocations. */
  timeoutMs?: number;
}

export interface CliResolvedCommand {
  command: CliCommand;
  args: string[];
  tokens: string[];
}
