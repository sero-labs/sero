/**
 * SubagentRunner — executes a single subagent task via a transient AgentSession.
 *
 * Each run creates an in-memory session with the full Sero system prompt,
 * the agent's .md body appended via the resource loader's appendSystemPrompt,
 * and workspace tools. The session is disposed immediately after completion.
 */

import {
  createAgentSession,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import type { CreateAgentSessionOptions, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel, AgentMessage } from '@earendil-works/pi-agent-core';
import { getModelTierThinkingLevel, isModelTier } from '@sero-ai/common';
import { randomUUID } from 'node:crypto';

import type { RunnerConfig, RunResult, SubagentUsage, SubagentToolActivity, PlatformToolPolicy } from '../core/types';
import type { SharedInfra } from '@electron/shared/infra/shared-infra';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { createRuntimeTools } from '@electron/features/container/tools';
import { SEARCH_TOOL_NAMES } from '@electron/features/apps/extensions/search-plugin';
import { WORKSPACE_DIR } from '@electron/features/container/tools/tool-schemas';
import { createSubagentResourceLoader } from './resource-loader';
import { recordRunToolCatalog } from './tool-catalog';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { logRawEvent, logTurnContext } from '@electron/ipc/editor/debug';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { parseModelField, resolveTierModel } from '@electron/shared/settings/resolve-tier-model';
import { getModelTiers } from '@electron/shared/settings/model-tiers';
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

/**
 * Apply the platform-tool policy to the workspace tool set.
 * 'none' callers skip building platform tools entirely; this filter
 * handles 'all' and 'readOnly'.
 */
export function filterPlatformTools(
  tools: ToolDefinition[],
  policy: PlatformToolPolicy,
): ToolDefinition[] {
  if (policy === 'none') return [];
  if (policy === 'readOnly') return tools.filter((tool) => tool.name === 'read');
  return tools;
}

/**
 * Session tool enforcement for the platform-tool policy.
 *
 * `noTools: 'builtin'` disables only Pi built-ins; tools registered by
 * extensions loaded into the session survive it. Restricted policies
 * therefore set an explicit allowlist of exactly the session's tools,
 * which excludes extension-registered tools as well.
 */
export function sessionToolOptions(
  policy: PlatformToolPolicy,
  sessionTools: ToolDefinition[],
  allowlist?: string[],
): Pick<CreateAgentSessionOptions, 'noTools' | 'tools'> {
  // A per-step allowlist wins: activate only those tools (the SDK ignores names
  // it doesn't recognise). This also trims the per-tool prompt guidance.
  if (allowlist && allowlist.length > 0) return { noTools: 'builtin', tools: allowlist };
  if (policy === 'all') return { noTools: 'builtin' };

  const names = sessionTools.map((tool) => tool.name);
  // A read-only subagent keeps the read-only search tools. Without them it can
  // read a file it is told about but cannot find one, and its only alternative
  // is the shell this policy exists to withhold. 'none' stays exactly none.
  const searchTools = policy === 'readOnly'
    ? SEARCH_TOOL_NAMES.filter((name) => !names.includes(name))
    : [];
  return { noTools: 'builtin', tools: [...names, ...searchTools] };
}

export interface RunnerDeps {
  infra: SharedInfra;
  workspaceManager: WorkspaceManager;
}

/**
 * Run a single subagent task. Creates a transient session, sends the task,
 * collects the response, then disposes the session.
 */
export async function runSubagent(
  config: RunnerConfig,
  deps: RunnerDeps,
): Promise<RunResult> {
  const { agent, task, resolved, workspaceId, signal, onProgress, cwdOverride } = config;
  const { infra, workspaceManager } = deps;

  const workspaceRoot = workspaceManager.getPath(workspaceId);
  const {
    sessionPath,
    containerCwd,
  } = resolveSubagentPaths(workspaceRoot, cwdOverride);

  if (!sessionPath) {
    return { response: '', usage: { ...EMPTY_USAGE }, error: `Workspace '${workspaceId}' not found` };
  }

  // Check if already aborted
  if (signal.aborted) {
    return { response: '', usage: { ...EMPTY_USAGE }, error: 'Aborted before start' };
  }

  // Generate a unique session ID for this subagent run. A random suffix is
  // required on top of the timestamp: parallel steps under the same parent (e.g.
  // an Orchestrator batch) can start in the same millisecond and would otherwise
  // collide on the id, which keys container tools, debug logs, and the session.
  const subagentSessionId = `subagent-${config.parentSessionId}-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const policy = config.platformTools ?? 'all';
  let platformTools: ToolDefinition[] = [];
  if (policy !== 'none') {
    const runtime = await runtimeManager.getRuntime(workspaceId);
    try {
      await runtime.ensure();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[subagent/runner] ${runtime.backend} runtime unavailable: ${message}`);
      return {
        response: '',
        usage: { ...EMPTY_USAGE },
        error: `${runtime.backend} runtime failed to start for workspace ${workspaceId}: ${message}`,
      };
    }
    platformTools = filterPlatformTools(
      await createRuntimeTools(runtime, subagentSessionId, containerCwd),
      policy,
    );
  }
  // User context override: drop disabled tools from the surface entirely.
  const disabledTools = new Set(config.disabledTools ?? []);
  const customTools = [...platformTools, ...(config.customTools ?? [])].filter(
    (tool) => !disabledTools.has(tool.name),
  );

  // Build the child session's resource loader (shared with the tool-catalog
  // enumeration). The agent prompt rides on appendSystemPrompt so it survives a
  // base systemPromptOverride; disabled skills are hidden from the model. A
  // caller's `appendSystemPrompt` (e.g. the Orchestrator's step contract) rides
  // AFTER the agent body, so it survives even when a named agent is used.
  const appendSystemPrompt = [agent.systemPrompt, ...(config.appendSystemPrompt ?? [])].filter(
    (section): section is string => !!section,
  );
  const loader = createSubagentResourceLoader({
    cwd: sessionPath,
    workspaceManager,
    workspaceId,
    sessionId: subagentSessionId,
    settingsManager: infra.settingsManager,
    containerCwd,
    systemPromptOverride: config.systemPromptOverride,
    appendSystemPrompt: appendSystemPrompt.length > 0 ? appendSystemPrompt : undefined,
    disabledSkills: config.disabledSkills,
  });
  await loader.reload();

  if (signal.aborted) {
    return { response: '', usage: { ...EMPTY_USAGE }, error: 'Aborted before start' };
  }

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
    const sessionOptions: CreateAgentSessionOptions = {
      cwd: sessionPath,
      agentDir: SERO_AGENT_DIR,
      modelRuntime: infra.modelRuntime,
      ...sessionToolOptions(policy, customTools, config.tools),
      customTools,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(sessionPath),
      settingsManager: infra.settingsManager,
    };
    const result = await createAgentSession(sessionOptions);
    session = result.session;

    let effectiveThinking = resolved.thinking;

    // Try to set the resolved model — needs provider/modelId lookup
    try {
      const available = infra.modelRegistry.getAvailable();
      const globalSettings = infra.settingsManager.getGlobalSettings() as Record<string, unknown>;
      const tierSettings = getModelTiers(globalSettings);
      const parsed = parseModelField(resolved.modelSelection);
      const resolvedModel = parsed
        ? resolveTierModel(parsed, tierSettings, available)
        : null;

      if (parsed && isModelTier(parsed.prefer) && resolved.thinkingSource === 'default') {
        effectiveThinking = getModelTierThinkingLevel(tierSettings[parsed.prefer], resolved.thinking);
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
      session.setThinkingLevel(effectiveThinking as ThinkingLevel);
    } catch {
      // Fall back to default
    }

    const usage: SubagentUsage = { ...EMPTY_USAGE };

    // Set up abort handler
    const abortHandler = () => {
      try { session?.abort(); } catch { /* ignore */ }
    };
    signal.addEventListener('abort', abortHandler, { once: true });
    if (signal.aborted) {
      abortHandler();
      signal.removeEventListener('abort', abortHandler);
      return { response: '', usage, modelId: session.model?.id, providerId: session.model?.provider, error: 'Aborted' };
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      try { session?.abort(); } catch { /* ignore */ }
    }, resolved.timeoutMs);

    // Track usage, tool activity, live output + debug logging
    const { onToolActivity, onTextDelta, onUpdate: onStatusUpdate } = config;
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

      if (event.type === 'turn_start' && session) {
        logTurnContext(subagentSessionId, session);
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

      // Text + reasoning deltas → live output stream. Reasoning is forwarded
      // alongside the answer text so structured-output agents (which emit
      // almost no answer text before their terminating tool call) still show
      // live progress. The final response is rebuilt from message text only,
      // so reasoning never leaks into the structured result.
      if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent as Record<string, unknown> | undefined;
        if (
          (ame?.type === 'text_delta' || ame?.type === 'thinking_delta') &&
          typeof ame.delta === 'string'
        ) {
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

    // Publish the run's resolved tool surface to the shared catalog (the planner
    // and loop context editor read it). Best-effort — never blocks the run.
    try { recordRunToolCatalog(session.getAllTools()); } catch { /* catalog is best-effort */ }

    let response = extractResponse(session.messages);

    // In-session structured-output repair: if the caller validates the reply
    // and asks for a correction, send the follow-up IN THIS SAME session (full
    // context and tools retained — no new subagent), up to maxAttempts.
    const repair = config.repair;
    if (repair) {
      for (let i = 0; i < repair.maxAttempts && !signal.aborted; i += 1) {
        let followUp: string | null;
        try {
          followUp = repair.validate(response);
        } catch {
          break; // a throwing validator never blocks the run
        }
        if (followUp == null) break;
        await session.prompt(followUp);
        response = extractResponse(session.messages);
      }
    }

    clearTimeout(timeoutId);
    clearStallTimer();
    signal.removeEventListener('abort', abortHandler);
    unsub();

    // Check if we were aborted or timed out
    if (signal.aborted) {
      return { response: '', usage, modelId: session.model?.id, providerId: session.model?.provider, error: 'Aborted' };
    }

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

    return { response, usage, modelId: session.model?.id, providerId: session.model?.provider };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Best-effort provenance — the session may exist even when the run failed
    const usage: SubagentUsage = { ...EMPTY_USAGE };
    try {
      const stats = session?.getSessionStats();
      if (stats) {
        usage.inputTokens = stats.tokens.input;
        usage.outputTokens = stats.tokens.output;
        usage.cacheReadTokens = stats.tokens.cacheRead;
        usage.cacheWriteTokens = stats.tokens.cacheWrite;
        usage.totalTokens = stats.tokens.total;
        usage.cost = stats.cost;
      }
    } catch { /* session unusable — keep zeros */ }
    const modelId = session?.model?.id;
    const providerId = session?.model?.provider;

    // Distinguish timeout from other errors
    if (signal.aborted) {
      return { response: '', usage, modelId, providerId, error: 'Aborted' };
    }

    return { response: '', usage, modelId, providerId, error: errorMsg };
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
  // Return the full value, the tracker caps its length (MAX_TOOL_ARGS_CHARS) and
  // the UI truncates it to fit, showing the full command on hover.
  if (typeof args.command === 'string') return args.command;
  if (typeof args.path === 'string') return args.path;
  if (typeof args.file_path === 'string') return args.file_path;
  if (typeof args.query === 'string') return args.query;
  if (typeof args.pattern === 'string') return args.pattern;
  // Fallback: first string value
  const first = Object.values(args).find((v) => typeof v === 'string');
  return typeof first === 'string' ? first : '';
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
