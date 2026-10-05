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
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { getModelTierThinkingLevel, isModelTier } from '@sero-ai/common';
import { randomUUID } from 'node:crypto';

import type { RunnerConfig, RunResult, SubagentUsage } from '../core/types';
import { observationForEvent, repairAttemptObservation, type ObservationContext } from './session-observation';
import { extractResponse, extractToolArgsSummary } from './session-output';
import {
  createAbortGrace,
  createToolStallWatch,
  GAVE_UP,
  raceGrace,
  settleOrGiveUp,
  type ToolStallWatch,
} from './abort-grace';
import { filterPlatformTools, resolveSubagentPaths, sessionToolOptions, codemodeToolOptions } from './session-policy';
import type { SharedInfra } from '@electron/shared/infra/shared-infra';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { createRuntimeTools } from '@electron/features/container/tools';
import { containerPromptState, type ContainerPromptState } from '@electron/features/container/tools/container-prompt-state';
import { activateCodemode, CODEMODE_TOOL_NAME } from '@electron/features/codemode';
import { preserveBashFailureStatus } from '@electron/features/tool-capture/bash-result-error-status';
import { clearBridgedExtensionSessionStateForSession } from '@electron/cli';
import { createSubagentResourceLoader, shouldBridgePluginTools } from './resource-loader';
import { recordRunToolCatalog } from './tool-catalog';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { logRawEvent, logTurnContext } from '@electron/ipc/editor/debug';
import { shutdownAndDispose, startSessionExtensions } from '@electron/ipc/agent/core/agent-session-events';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { parseModelField, resolveTierModel } from '@electron/shared/settings/resolve-tier-model';
import { getModelTiers } from '@electron/shared/settings/model-tiers';

const EMPTY_USAGE: SubagentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  cost: 0,
};

type AgentSession = Awaited<ReturnType<typeof createAgentSession>>['session'];

/** Update usage from a SDK snapshot without losing a known high-water mark. */
function readSessionUsage(session: AgentSession | null, usage: SubagentUsage): void {
  try {
    const stats = session?.getSessionStats();
    if (!stats) {
      usage.incomplete = true;
      return;
    }
    usage.inputTokens = Math.max(usage.inputTokens, stats.tokens.input);
    usage.outputTokens = Math.max(usage.outputTokens, stats.tokens.output);
    usage.cacheReadTokens = Math.max(usage.cacheReadTokens, stats.tokens.cacheRead);
    usage.cacheWriteTokens = Math.max(usage.cacheWriteTokens, stats.tokens.cacheWrite);
    usage.totalTokens = Math.max(usage.totalTokens, stats.tokens.total);
    usage.cost = Math.max(usage.cost, stats.cost);
    delete usage.incomplete;
  } catch {
    usage.incomplete = true;
  }
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

  const usage: SubagentUsage = { ...EMPTY_USAGE };
  let session: AgentSession | null = null;
  // `session_shutdown` goes only to extensions that received `session_start`.
  let extensionsStarted = false;

  // Hoisted above try so finally can stop the timers and the listeners.
  let stalls: ToolStallWatch | null = null;
  let stopReason: string | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const grace = createAbortGrace();

  // A stop may arrive before the session exists. Abort the session at most
  // once, and only when there is one to abort. `stopRun` always starts the
  // grace, so every bounded wait shares one stop signal.
  let sessionStopped = false;
  const stopSession = (): void => {
    if (sessionStopped || !session) return;
    sessionStopped = true;
    try { session.abort(); } catch { /* ignore */ }
  };
  const stopRun = (): void => {
    stopSession();
    grace.start();
  };
  const stopped = (): boolean => signal.aborted || stopReason !== undefined;

  // One disposal path, shared by the run and by a session that appears after
  // the run gave up. It runs once, so a session is never disposed twice and is
  // never left undisposed.
  let disposed = false;
  const disposeRunSession = async (): Promise<void> => {
    if (disposed || !session) return;
    disposed = true;
    clearBridgedExtensionSessionStateForSession(subagentSessionId);
    if (extensionsStarted) {
      try { await shutdownAndDispose(session, `subagent ${subagentSessionId}`); } catch { /* ignore */ }
    } else {
      try { session.dispose(); } catch { /* ignore */ }
    }
  };
  const stoppedResult = (): RunResult => ({
    response: '',
    usage,
    modelId: session?.model?.id,
    providerId: session?.model?.provider,
    error: stopReason ?? (session ? 'Aborted' : 'Aborted before start'),
  });

  // The caller's stop and the run's time limit cover ALL of setup: the
  // workspace container, the resource loader, `createAgentSession`, the model
  // lookup and the extension start. Setup used to run with no limit, so a
  // container that never started, a plugin loader that hung, a session that was
  // never created, or a model that never resolved held the run — and the
  // Workflow step that waits on it — open for good.
  signal.addEventListener('abort', stopRun, { once: true });
  timeoutId = setTimeout(() => {
    stopReason = `Timed out after ${Math.round(resolved.timeoutMs / 1000)}s`;
    stopRun();
  }, resolved.timeoutMs);

  try {
    type SetupOutcome =
      | { ok: true; session: AgentSession }
      | { ok: false; stopped: true }
      | { ok: false; result: RunResult };

    // Setup is bounded by the same grace as the prompt: once the run is
    // stopped, a step that does not end lets the run give up after
    // ABORT_GRACE_MS. Every step reads the stop again, so a stop that arrives
    // during one step does not pay for the rest of setup.
    const setup = (async (): Promise<SetupOutcome> => {
      const policy = config.platformTools ?? 'all';
      let platformTools: ToolDefinition[] = [];
      let containerState: ContainerPromptState | undefined;
      if (policy !== 'none') {
        const runtime = await runtimeManager.getRuntime(workspaceId);
        if (stopped()) return { ok: false, stopped: true };
        try {
          await runtime.ensure();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[subagent/runner] ${runtime.backend} runtime unavailable: ${message}`);
          return {
            ok: false,
            result: {
              response: '',
              usage: { ...EMPTY_USAGE },
              error: `${runtime.backend} runtime failed to start for workspace ${workspaceId}: ${message}`,
            },
          };
        }
        if (stopped()) return { ok: false, stopped: true };
        containerState = containerPromptState(runtime);
        platformTools = filterPlatformTools(
          await createRuntimeTools(runtime, subagentSessionId, containerCwd),
          policy,
        );
        if (stopped()) return { ok: false, stopped: true };
      }
      // User context override: drop disabled tools from the surface entirely.
      const disabledTools = new Set(config.disabledTools ?? []);
      // Pi's `codemode` is a session tool, not a custom tool. An allowlist wins,
      // otherwise only a disabled tool takes it away.
      const codemodeAllowlist = config.tools && config.tools.length > 0 ? config.tools : undefined;
      const codemodeAllowed = codemodeAllowlist
        ? codemodeAllowlist.includes(CODEMODE_TOOL_NAME)
        : !disabledTools.has(CODEMODE_TOOL_NAME);
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
        containerState,
        systemPromptOverride: config.systemPromptOverride,
        appendSystemPrompt: appendSystemPrompt.length > 0 ? appendSystemPrompt : undefined,
        disabledSkills: config.disabledSkills,
        restrictSearchTools: policy === 'readOnly',
        bridgePluginTools: shouldBridgePluginTools(policy, config.tools, disabledTools),
      });
      await loader.reload();
      if (stopped()) return { ok: false, stopped: true };

      const sessionOptions: CreateAgentSessionOptions = {
        cwd: sessionPath,
        agentDir: SERO_AGENT_DIR,
        modelRuntime: infra.modelRuntime,
        ...sessionToolOptions(policy, customTools, config.tools),
        ...codemodeToolOptions(policy, customTools, config.tools, codemodeAllowed),
        customTools,
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(sessionPath),
        settingsManager: infra.settingsManager,
        sessionStartEvent: { type: 'session_start', reason: 'startup' },
      };
      const result = await createAgentSession(sessionOptions);
      session = result.session;
      // A stop that arrived while the session was being created must not pay
      // for a model switch or an extension start on a session the run will drop.
      if (stopped()) return { ok: false, stopped: true };
      // Pi registers `codemode` inactive. Switch it on, so it is a normal session tool.
      if (codemodeAllowed) activateCodemode(session);
      preserveBashFailureStatus(session.agent);

      let effectiveThinking = resolved.thinking;

      // A selected model must resolve before any prompt can run.
      {
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

        if (parsed && !resolvedModel) throw new Error(`Selected model ${parsed.prefer} is unavailable. Update the model selection before retrying.`);
        if (resolvedModel) {
          const model = infra.modelRegistry.find(resolvedModel.provider, resolvedModel.modelId);
          if (!model) throw new Error(`Selected model ${resolvedModel.provider}/${resolvedModel.modelId} is unavailable.`);
          await session.setModel(model);
          if (stopped()) return { ok: false, stopped: true };
        }
      }

      // Set thinking level
      try {
        session.setThinkingLevel(effectiveThinking as ThinkingLevel);
      } catch {
        // Fall back to default
      }
      if (stopped()) return { ok: false, stopped: true };

      // From here on extensions may receive `session_start`, so they must be
      // shut down even if the start does not finish.
      extensionsStarted = true;
      // After the model is set, so `session_start` handlers see the run's model.
      await startSessionExtensions(session);
      return { ok: true, session };
    })();

    const prepared = await raceGrace(setup, grace);
    if (prepared === GAVE_UP) {
      // Setup is abandoned but still running. Let it reach its next stop check,
      // then clear any bridged state it registered and dispose whatever it
      // created — with `session_shutdown` when extensions had started.
      void (async () => {
        try { await setup; } catch { /* the run already ended; nothing to report */ }
        clearBridgedExtensionSessionStateForSession(subagentSessionId);
        await disposeRunSession();
      })();
      return stoppedResult();
    }
    if (!prepared.ok) {
      if ('stopped' in prepared) {
        // The stop may have arrived while the session did not exist yet.
        stopSession();
        return stoppedResult();
      }
      return prepared.result;
    }
    session = prepared.session;

    if (stopped()) {
      // The stop may have arrived while the session did not exist yet.
      stopSession();
      return stoppedResult();
    }

    // Track usage, tool activity, live output + debug logging
    const { onToolActivity, onTextDelta, onUpdate: onStatusUpdate } = config;
    // Per-tool stall detection: a single tool call that runs longer than toolStallTimeoutMs is aborted.
    const toolStallMs = resolved.toolStallTimeoutMs ?? 120_000;

    stalls = createToolStallWatch(toolStallMs, (toolName) => {
      const stallMsg = `Tool '${toolName}' stalled after ${Math.round(toolStallMs / 1000)}s — auto-aborting`;
      stopReason = stallMsg;
      console.warn(`[subagent/runner] ${stallMsg}`);
      onStatusUpdate?.(`⚠️ ${stallMsg}`);
      stopRun();
    });
    // Calls in one reply run at the same time, so each is timed under its own id.
    const callIdOf = (event: Record<string, unknown>): string => String(event.toolCallId ?? event.toolName ?? 'unknown');
    const parentCallIdOf = (event: Record<string, unknown>): string | undefined =>
      typeof event.parentToolCallId === 'string' ? event.parentToolCallId : undefined;

    // Observation identities stay distinct: the run is the session here, a turn
    // is one prompt and its reply, a request is one model call, and a tool call
    // is identified by the SDK's toolCallId so two parallel calls to the same
    // tool never merge.
    const observe = config.onObservation
      ? (record: import('@sero-ai/common').ObservationRecord): void => {
          try { config.onObservation?.(record); } catch { /* observation only */ }
        }
      : undefined;
    const modelId = session.model ? `${session.model.provider}/${session.model.id}` : undefined;
    const observationContext: ObservationContext = { operationId: subagentSessionId, model: modelId };

    const unsub = session.subscribe((event: Record<string, unknown>) => {
      // Forward all events to the debug log (same file as main sessions)
      logRawEvent(subagentSessionId, event);
      // A request or a tool call is an observable act; a text delta is the answer
      // being written. Only the former is recorded.
      const observed = observationForEvent(event, observationContext, new Date().toISOString());
      if (observed) observe?.(observed);

      if (event.type === 'turn_start' && session) {
        logTurnContext(subagentSessionId, session);
      }

      // Tool execution events → tool activity feed + stall detection + observation
      if (event.type === 'tool_execution_start') {
        const toolName = (event.toolName as string) ?? 'unknown';
        const args = event.args as Record<string, unknown> | undefined;
        const summary = extractToolArgsSummary(toolName, args);
        onToolActivity?.(toolName, summary, true);
        onStatusUpdate?.(`  📂 ${toolName}: ${summary}`);
        stalls?.start(callIdOf(event), toolName, parentCallIdOf(event));
      }

      if (event.type === 'tool_execution_end') {
        const toolName = (event.toolName as string) ?? 'unknown';
        onToolActivity?.(toolName, '', false);
        stalls?.end(callIdOf(event));
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
          onTextDelta?.(ame.delta, ame.type === 'thinking_delta');
        }
      }

      if (event.type === 'turn_end' || event.type === 'agent_end') {
        stalls?.clear();
        readSessionUsage(session, usage);
        onProgress?.(usage);
      }
    });

    // Send the task and wait for completion
    await settleOrGiveUp(session.prompt(task), grace);

    // Publish the run's resolved tool surface to the shared catalog (the planner
    // and loop context editor read it). Best-effort — never blocks the run.
    try { recordRunToolCatalog(session.getAllTools()); } catch { /* catalog is best-effort */ }

    let response = extractResponse(session.messages);

    // In-session structured-output repair: if the caller validates the reply
    // and asks for a correction, send the follow-up IN THIS SAME session (full
    // context and tools retained — no new subagent), up to maxAttempts.
    const repair = config.repair;
    if (repair) {
      for (let i = 0; i < repair.maxAttempts && !signal.aborted && !stopReason; i += 1) {
        let followUp: string | null;
        try {
          followUp = repair.validate(response);
        } catch {
          break; // a throwing validator never blocks the run
        }
        if (followUp == null) break;
        // A repair pass is its own observable attempt: it costs a request and
        // must not be folded into the first reply's timing.
        observe?.(repairAttemptObservation(i + 1, observationContext, 'start', new Date().toISOString()));
        await settleOrGiveUp(session.prompt(followUp), grace);
        response = extractResponse(session.messages);
        observe?.(repairAttemptObservation(i + 1, observationContext, 'end', new Date().toISOString()));
      }
    }

    stalls?.clear();
    unsub();

    // Final usage stats
    readSessionUsage(session, usage);

    if (stopped()) {
      stopSession();
      return stoppedResult();
    }
    return { response, usage, modelId: session.model?.id, providerId: session.model?.provider };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Best-effort provenance — the session may exist even when the run failed.
    readSessionUsage(session, usage);
    const modelId = session?.model?.id;
    const providerId = session?.model?.provider;

    if (stopped()) {
      return { response: '', usage, modelId, providerId, error: stopReason ?? 'Aborted' };
    }

    return { response: '', usage, modelId, providerId, error: errorMsg };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    stalls?.clear();
    grace.clear();
    signal.removeEventListener('abort', stopRun);
    await disposeRunSession();
    clearBridgedExtensionSessionStateForSession(subagentSessionId);
  }
}

/**
 * Extract a short summary from tool arguments for the activity feed.
 */
