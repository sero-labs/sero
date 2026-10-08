import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { containerManager, workspaceManager } from '@electron/shared/infra/shared-infra';
import type { CliCommandContext } from './types';
import type { CliRegistry } from './registry';
import {
  executeCliBatch,
  getMultiCommandFallbackContent,
  getSingleResultContent,
} from './batch-executor';
import {
  bridgeToolUpdate,
  buildInvocation,
  buildSessionRuntime,
  extractAgentContext,
} from './invocation-context';
import { splitCommandLines } from './parser';

const SeroCliToolParams = Type.Object({
  command: Type.String({
    description:
      'Sero CLI command string (e.g. "todo list"). Supports multi-line input for chaining (one command per line).',
  }),
  timeout: Type.Optional(
    Type.Number({ description: 'Batch timeout in seconds (default: 120)' }),
  ),
});

export { executeCliArgv, executeCliBatch } from './batch-executor';
export { extractAgentContext } from './invocation-context';

export function createSeroCliTool(
  registry: CliRegistry,
  workspaceId: string,
  sessionId: string,
): ToolDefinition<typeof SeroCliToolParams> {
  return defineTool({
    name: 'sero-cli',
    label: 'Sero CLI',
    description:
      'Execute Sero platform commands. Run `sero help` for commands. Supports multi-line input to chain commands (one per line).',
    parameters: SeroCliToolParams,
    async execute(toolCallId, params, signal, onUpdate, toolCtx) {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) {
        return { content: [{ type: 'text', text: `ERROR: Workspace not found: ${workspaceId}` }], details: { exitCode: 1 }, isError: true };
      }

      const invocation = buildInvocation(workspaceId, sessionId, signal, toolCallId);
      const context: CliCommandContext = {
        workspaceId,
        cwd: toolCtx?.cwd ?? wsPath,
        invocation,
        workspaceManager,
        containerManager,
        agentContext: toolCtx ? extractAgentContext(toolCtx) : undefined,
        sessionRuntime: buildSessionRuntime({ workspaceId, invocation }),
      };

      const batch = await executeCliBatch(
        registry,
        params.command,
        context,
        params.timeout,
        bridgeToolUpdate(onUpdate),
      );
      const lines = splitCommandLines(params.command);
      const isSingleCommand = lines.length === 1;

      const richOutputFallback = !isSingleCommand && batch.richOutputFallback === true;

      return {
        // A failed command is a failed call. A Code Mode script stops only on
        // a call that says so itself: Pi does not run a script's calls through
        // the host hook that marks a direct call.
        ...(batch.exitCode !== 0 ? { isError: true } : {}),
        content: isSingleCommand
          ? getSingleResultContent(batch)
          : getMultiCommandFallbackContent(batch, richOutputFallback),
        details: {
          exitCode: batch.exitCode,
          ...(batch.details && typeof batch.details === 'object' ? batch.details as Record<string, unknown> : {}),
          ...(!isSingleCommand ? {
            richOutputFallback,
            ...(richOutputFallback ? {
              fallbackReason: 'some rich output could not be represented in this multi-command batch',
            } : {}),
          } : {}),
        },
      };
    },
  });
}
