import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type {
  ExtensionRuntimeMessage,
  ExtensionSessionRuntime,
} from '@sero-ai/common';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

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

export type CliCustomMessage = ExtensionRuntimeMessage;

export interface CliSessionRuntime extends ExtensionSessionRuntime {
  sessionId: string;
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
  /**
   * Narrow execution-scoped runtime for session side effects.
   * Lets bridged tools interact with the current session without capturing `pi`.
   */
  sessionRuntime?: CliSessionRuntime;
}

export interface CliCommandUpdate {
  content: CliContentBlock[];
  details?: unknown;
}

export interface CliAppCommandOwner {
  kind: 'session-extension';
  sessionId: string;
  extensionPath: string;
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
  owner?: CliAppCommandOwner;
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
