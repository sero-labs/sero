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
} from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel, AgentMessage } from '@mariozechner/pi-agent-core';

import type { RunnerConfig, RunResult, SubagentUsage, SubagentToolActivity } from '../core/types';
import type { SharedInfra } from '../../../shared/infra/shared-infra';
import type { WorkspaceManager } from '../../workspace/manager';
import type { ContainerManager } from '../../container';
import type { ContainerState } from '../../container/core/types';
import { buildWorkspaceContainerConfig } from '../../container/core/workspace-container-config';
import { createContainerTools, createHostCodingTools } from '../../container/tools';
import { WORKSPACE_DIR } from '../../container/tools/tool-schemas';
import { createWorkspaceCliTool } from '../../../cli';
import { createSubagentExtensionFactory } from './loader';
import { SERO_AGENT_DIR } from '../../../platform/env';
import { logRawEvent, logTurnContext } from '../../../ipc/editor/debug';
import { createSkillVisibilityOverride } from '../../apps/extensions/skill-visibility';
import { parseModelField, resolveTierModel } from '../../../shared/settings/resolve-tier-model';
import { getModelTiers } from '../../../shared/settings/model-tiers';
import path from 'path';

const EMPTY_USAGE: SubagentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  cost: 0,
};

export interface ResolvedSubagentPaths {
  sessionPath: string | null;
  containerHostPath: string | null;
  containerCwd?: string;
}

/**
 * Resolve the host/session/container paths for a subagent run.
 *
 * `cwdOverride` may point at a git worktree inside the workspace. In that
 * case the agent should still run tools from the worktree, but the container
 * itself must mount the workspace root so Git can see `.git/worktrees/...`.
 */
export function resolveSubagentPaths(
  workspaceRoot: string | undefined,
  cwdOverride?: string,
): ResolvedSubagentPaths {
  const sessionPath = cwdOverride ?? workspaceRoot ?? null;
  const containerHostPath = workspaceRoot ?? sessionPath;

  if (!sessionPath) {
    return {
      sessionPath: null,
      containerHostPath: null,
    };
  }

  if (!cwdOverride || !workspaceRoot) {
    return {
      sessionPath,
      containerHostPath,
    };
  }

  const rel = path.relative(workspaceRoot, cwdOverride);
  if (!rel || rel === '.') {
    return {
      sessionPath,
      containerHostPath,
      containerCwd: WORKSPACE_DIR,
    };
  }
  if (rel.startsWith('..')) {
    return {
      sessionPath,
      containerHostPath,
    };
  }

  return {
    sessionPath,
    containerHostPath,
    containerCwd: `${WORKSPACE_DIR}/${rel}`,
  };
}

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
  const { agent, task, resolved, workspaceId, signal, onProgress, cwdOverride, isolated } = config;
  const { infra, workspaceManager, containerManager } = deps;

  const workspaceRoot = workspaceManager.getPath(workspaceId);
  const {
    sessionPath,
    containerHostPath,
    containerCwd,
  } = resolveSubagentPaths(workspaceRoot, cwdOverride);

  if (!sessionPath) {
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
      const containerConfig = await buildWorkspaceContainerConfig(
        workspaceManager,
        workspaceId,
        containerHostPath ?? sessionPath,
        { isolated },
      );
      containerState = await containerManager.ensure(containerConfig);
    } catch (err: unknown) {
      console.warn('[subagent/runner] Container not available, using host tools:', (err as Error)?.message);
    }
  }

  const useContainer = !!containerState;

  const platformTools = useContainer
    ? createContainerTools(containerManager, workspaceId, subagentSessionId, containerCwd)
    : [...createHostCodingTools(sessionPath), createWorkspaceCliTool(workspaceId, subagentSessionId)];
  const customTools = [...platformTools, ...(config.customTools ?? [])];

  // Build a reduced extension factory for the child session
  const loader = new DefaultResourceLoader({
    cwd: sessionPath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    extensionFactories: [
      createSubagentExtensionFactory(
        workspaceManager,
        workspaceId,
        subagentSessionId,
        containerState ?? undefined,
        containerCwd,
      ),
    ],
    skillsOverride: createSkillVisibilityOverride(infra.settingsManager),
  });
  await loader.reload();

  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null;

  // Stall timer state — hoisted above try so finally can access clearStallTimer
  let activeToolStallTimer: ReturnType<typeof setTimeout> | null = null;
  let activeToolName: string | null = null;

  function clearStallTimer(): void {
    if (activeToolStallTimer) {
      clearTimeout(activeToolStallTimer);
      activeToolStallTimer = null;
    }
    activeToolName = null;
  }

  try {
    const result = await createAgentSession({
      cwd: sessionPath,
      agentDir: SERO_AGENT_DIR,
      authStorage: infra.authStorage,
      modelRegistry: infra.modelRegistry,
      tools: [],
      customTools,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(sessionPath),
      settingsManager: infra.settingsManager,
      systemPromptSuffix: agent.systemPrompt,
    } as Parameters<typeof createAgentSession>[0]); // systemPromptSuffix is a Sero extension not in the SDK's public type
    session = result.session;

    // Try to set the resolved model — needs provider/modelId lookup
    try {
      const available = infra.modelRegistry.getAvailable();
      const globalSettings = infra.settingsManager.getGlobalSettings() as Record<string, unknown>;
      const tierSettings = getModelTiers(globalSettings);

      // Check if the resolved model string is a tier alias or has a structured source
      const agentModelField = agent.model;
      const parsed = parseModelField(agentModelField);
      let resolvedModel: { provider: string; modelId: string } | null = null;

      if (parsed) {
        // Use the full structured field for resolution (tier + fallbacks)
        resolvedModel = resolveTierModel(parsed, tierSettings, available);
      }

      if (!resolvedModel) {
        // Legacy: try the flat resolved.model string directly
        const match = available.find((m) => m.id === resolved.model);
        if (match) resolvedModel = { provider: match.provider, modelId: match.id };
      }

      if (resolvedModel) {
        const model = infra.modelRegistry.find(resolvedModel.provider, resolvedModel.modelId);
        if (model) await session.setModel(model);
      }
    } catch {
      // Fall back to settingsManager default — still works
    }

    // Set thinking level
    try {
      session.setThinkingLevel(resolved.thinking as ThinkingLevel);
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

    // ── Per-tool stall detection ──────────────────────────────
    // If a single tool call runs longer than toolStallTimeoutMs, abort.
    const toolStallMs = resolved.toolStallTimeoutMs ?? 120_000;

    function startStallTimer(toolName: string): void {
      clearStallTimer();
      if (toolStallMs <= 0) return; // disabled
      activeToolName = toolName;
      activeToolStallTimer = setTimeout(() => {
        const stallMsg = `Tool '${toolName}' stalled after ${Math.round(toolStallMs / 1000)}s — auto-aborting`;
        console.warn(`[subagent/runner] ${stallMsg}`);
        onStatusUpdate?.(`⚠️ ${stallMsg}`);
        try { session?.abort(); } catch { /* ignore */ }
      }, toolStallMs);
    }

    const unsub = session.subscribe((event: Record<string, unknown>) => {
      // Forward all events to the debug log (same file as main sessions)
      logRawEvent(subagentSessionId, event);

      if (event.type === 'turn_start') {
        logTurnContext(subagentSessionId, session!);
      }

      // Tool execution events → tool activity feed + stall detection
      if (event.type === 'tool_execution_start') {
        const toolName = (event.toolName as string) ?? 'unknown';
        const args = event.args as Record<string, unknown> | undefined;
        const summary = extractToolArgsSummary(toolName, args);
        onToolActivity?.(toolName, summary, true);
        onStatusUpdate?.(`  📂 ${toolName}: ${summary}`);
        startStallTimer(toolName);
      }

      if (event.type === 'tool_execution_end') {
        const toolName = (event.toolName as string) ?? 'unknown';
        onToolActivity?.(toolName, '', false);
        clearStallTimer();
      }

      // Text deltas → live output stream
      if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent as Record<string, unknown> | undefined;
        if (ame?.type === 'text_delta' && typeof ame.delta === 'string') {
          onTextDelta?.(ame.delta);
        }
      }

      if (event.type === 'agent_end') {
        clearStallTimer();
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
    clearStallTimer();
    signal.removeEventListener('abort', abortHandler);
    unsub();

    // Check if we were aborted or timed out
    if (signal.aborted) {
      return { response: '', usage, error: 'Aborted' };
    }

    // Extract the full response from session messages
    const response = extractResponse(session.messages);

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
    clearStallTimer();
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
function extractResponse(messages: AgentMessage[]): string {
  const assistantMessages = messages.filter(
    (m): m is Extract<AgentMessage, { role: 'assistant' }> =>
      'role' in m && m.role === 'assistant',
  );
  if (assistantMessages.length === 0) return '';

  // Get the last assistant message's text content
  const lastMsg = assistantMessages[assistantMessages.length - 1];
  return lastMsg.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c)
    .map((c) => c.text)
    .join('');
}
