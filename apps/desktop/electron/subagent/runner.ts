/**
 * SubagentRunner — executes a single subagent task via a transient AgentSession.
 *
 * Each run creates an in-memory session with the full Sero system prompt,
 * the agent's .md body as systemPromptSuffix, and workspace tools.
 * The session is disposed immediately after completion.
 */

import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  createCodingTools,
} from '@mariozechner/pi-coding-agent';

import type { RunnerConfig, RunResult, SubagentUsage, SubagentToolActivity } from './types';
import type { SharedInfra } from '../ipc/shared-infra';
import type { WorkspaceManager } from '../workspace';
import type { ContainerManager } from '../container/index';
import type { ContainerState } from '../container/types';
import { createContainerTools } from '../container/tools';
import { createSubagentExtensionFactory } from './loader';
import { SERO_AGENT_DIR } from '../env';
import { logRawEvent, logTurnContext } from '../ipc/debug';

const EMPTY_USAGE: SubagentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  cost: 0,
};

export interface RunnerDeps {
  infra: SharedInfra;
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
}

/**
 * Run a single subagent task. Creates a transient session, sends the task,
 * collects the response, then disposes the session.
 */
export async function runSubagent(
  config: RunnerConfig,
  deps: RunnerDeps,
): Promise<RunResult> {
  const { agent, task, resolved, workspaceId, signal, onProgress } = config;
  const { infra, workspaceManager, containerManager } = deps;

  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) {
    return { response: '', usage: { ...EMPTY_USAGE }, error: `Workspace '${workspaceId}' not found` };
  }

  // Check if already aborted
  if (signal.aborted) {
    return { response: '', usage: { ...EMPTY_USAGE }, error: 'Aborted before start' };
  }

  // Generate a unique session ID for this subagent run
  const subagentSessionId = `subagent-${config.parentSessionId}-${Date.now()}`;

  // Resolve container state (reuse workspace's existing container)
  let containerState: ContainerState | null = null;
  const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);
  if (containerEnabled) {
    try {
      const { buildContainerConfig } = await import('../ipc/shared-infra');
      const containerConfig = await buildContainerConfig(workspaceId, wsPath);
      containerState = await containerManager.ensure(containerConfig);
    } catch (err: unknown) {
      console.warn('[subagent/runner] Container not available, using host tools:', (err as Error)?.message);
    }
  }

  const useContainer = !!containerState;
  const containerTools = useContainer
    ? createContainerTools(containerManager, workspaceId, subagentSessionId)
    : [];
  const builtinTools = useContainer ? [] : createCodingTools(wsPath);

  // Build a reduced extension factory for the child session
  const loader = new DefaultResourceLoader({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    extensionFactories: [
      createSubagentExtensionFactory(workspaceManager, workspaceId, subagentSessionId, containerState ?? undefined),
    ],
  });
  await loader.reload();

  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null;

  try {
    const result = await createAgentSession({
      cwd: wsPath,
      agentDir: SERO_AGENT_DIR,
      authStorage: infra.authStorage,
      modelRegistry: infra.modelRegistry,
      tools: builtinTools,
      customTools: containerTools,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(wsPath),
      settingsManager: infra.settingsManager,
      systemPromptSuffix: agent.systemPrompt,
    });
    session = result.session;

    // Try to set the resolved model — needs provider/modelId lookup
    try {
      const available = infra.modelRegistry.getAvailable();
      const match = available.find((m) => m.id === resolved.model);
      if (match) {
        const model = infra.modelRegistry.find(match.provider, match.id);
        if (model) await session.setModel(model);
      }
    } catch {
      // Fall back to settingsManager default — still works
    }

    // Set thinking level
    try {
      session.setThinkingLevel(resolved.thinking);
    } catch {
      // Fall back to default
    }

    // Set up abort handler
    const abortHandler = () => {
      try { session?.abort(); } catch { /* ignore */ }
    };
    signal.addEventListener('abort', abortHandler, { once: true });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      try { session?.abort(); } catch { /* ignore */ }
    }, resolved.timeoutMs);

    // Track usage, tool activity, live output + debug logging
    const { onToolActivity, onTextDelta, onUpdate: onStatusUpdate } = config;
    const usage: SubagentUsage = { ...EMPTY_USAGE };
    const unsub = session.subscribe((event: Record<string, unknown>) => {
      // Forward all events to the debug log (same file as main sessions)
      logRawEvent(subagentSessionId, event);

      if (event.type === 'turn_start') {
        logTurnContext(subagentSessionId, session!);
      }

      // Tool execution events → tool activity feed
      if (event.type === 'tool_execution_start') {
        const toolName = (event.toolName as string) ?? 'unknown';
        const args = event.args as Record<string, unknown> | undefined;
        const summary = extractToolArgsSummary(toolName, args);
        onToolActivity?.(toolName, summary, true);
        onStatusUpdate?.(`  📂 ${toolName}: ${summary}`);
      }

      if (event.type === 'tool_execution_end') {
        const toolName = (event.toolName as string) ?? 'unknown';
        onToolActivity?.(toolName, '', false);
      }

      // Text deltas → live output stream
      if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent as Record<string, unknown> | undefined;
        if (ame?.type === 'text_delta' && typeof ame.delta === 'string') {
          onTextDelta?.(ame.delta);
        }
      }

      if (event.type === 'agent_end') {
        try {
          const stats = session?.getSessionStats();
          if (stats) {
            usage.inputTokens = stats.tokens.input;
            usage.outputTokens = stats.tokens.output;
            usage.cacheReadTokens = stats.tokens.cacheRead;
            usage.cacheWriteTokens = stats.tokens.cacheWrite;
            usage.totalTokens = stats.tokens.total;
            usage.cost = stats.cost;
            onProgress?.(usage);
          }
        } catch { /* ignore */ }
      }
    });

    // Send the task and wait for completion
    await session.prompt(task);

    clearTimeout(timeoutId);
    signal.removeEventListener('abort', abortHandler);
    unsub();

    // Check if we were aborted or timed out
    if (signal.aborted) {
      return { response: '', usage, error: 'Aborted' };
    }

    // Extract the full response from session messages
    const response = extractResponse(session);

    // Final usage stats
    try {
      const stats = session.getSessionStats();
      if (stats) {
        usage.inputTokens = stats.tokens.input;
        usage.outputTokens = stats.tokens.output;
        usage.cacheReadTokens = stats.tokens.cacheRead;
        usage.cacheWriteTokens = stats.tokens.cacheWrite;
        usage.totalTokens = stats.tokens.total;
        usage.cost = stats.cost;
      }
    } catch { /* ignore */ }

    return { response, usage };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Distinguish timeout from other errors
    if (signal.aborted) {
      return { response: '', usage: { ...EMPTY_USAGE }, error: 'Aborted' };
    }

    return { response: '', usage: { ...EMPTY_USAGE }, error: errorMsg };
  } finally {
    try { session?.dispose(); } catch { /* ignore */ }
  }
}

/**
 * Extract a short summary from tool arguments for the activity feed.
 */
function extractToolArgsSummary(toolName: string, args?: Record<string, unknown>): string {
  if (!args) return '';
  // Try common tool input shapes
  if (args.command && typeof args.command === 'string') {
    return args.command.length > 80 ? args.command.slice(0, 80) + '…' : args.command;
  }
  if (args.path && typeof args.path === 'string') return args.path as string;
  if (args.file_path && typeof args.file_path === 'string') return args.file_path as string;
  if (args.query && typeof args.query === 'string') return args.query as string;
  if (args.pattern && typeof args.pattern === 'string') return args.pattern as string;
  // Fallback: first string value
  const first = Object.values(args).find((v) => typeof v === 'string');
  return typeof first === 'string' ? (first.length > 80 ? first.slice(0, 80) + '…' : first) : '';
}

/**
 * Extract the full text response from a session's messages.
 */
function extractResponse(session: { messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }> }): string {
  const assistantMessages = session.messages.filter((m) => m.role === 'assistant');
  if (assistantMessages.length === 0) return '';

  // Get the last assistant message's text content
  const lastMsg = assistantMessages[assistantMessages.length - 1];
  return lastMsg.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
}
