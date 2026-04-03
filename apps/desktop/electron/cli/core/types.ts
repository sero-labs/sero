import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from '../../features/container';
import type { WorkspaceManager } from '../../features/workspace/manager';

/**
 * Subset of the Pi SDK's ExtensionContext forwarded through the CLI bridge.
 * Excludes `cwd` (provided separately by the CLI context) so it can be
 * recombined as a full ExtensionContext in schema-bridge.ts.
 */
export type BridgedAgentContext = Omit<ExtensionContext, 'cwd'>;

export type CliSource = 'tool' | 'bash' | 'terminal';

export interface CliInvocation {
  workspaceId: string;
  sessionId: string | null;
  turnId: string | null;
  source: CliSource;
  signal?: AbortSignal;
}

export type CliContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface CliResult {
  output: string;
  exitCode?: number;
  content?: CliContentBlock[];
  details?: unknown;
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
  /**
   * Agent context forwarded from the SDK's ExtensionContext.
   * Available when the CLI is invoked as a bridged tool during an agent turn.
   * Undefined for direct/standalone CLI invocations.
   */
  agentContext?: BridgedAgentContext;
}

export interface CliCommandUpdate {
  content: CliContentBlock[];
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
  /**
   * When true, per-command and batch timeouts are disabled for this command.
   * Use for tools that block on user input (question, questionnaire, interview).
   */
  interactive?: boolean;
}

export interface CliResolvedCommand {
  command: CliCommand;
  args: string[];
  tokens: string[];
}
