import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { randomUUID } from 'crypto';
import { resolveConfig } from './resolve';
import type { ConcurrencyPool } from './pool';
import type { SubagentTracker } from './tracker';
import type {
  AgentConfig,
  PlatformToolPolicy,
  SubagentEntry,
  SubagentSettings,
  SubagentUsage,
  TaskOverride,
} from './types';
import { runSubagent, type RunnerDeps } from '../runtime/runner';

const EMPTY_USAGE: SubagentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  cost: 0,
};

export interface SingleRunParams {
  agent?: string;
  task: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  parentSessionId: string;
  workspaceId: string;
  /** Override the working directory (e.g. for git worktree execution). */
  cwd?: string;
  /** Restrict to own workspace only — no cross-workspace mounts in container. */
  isolated?: boolean;
  /** Extra run-scoped tools to expose only for this subagent session. */
  customTools?: ToolDefinition[];
  /** Platform tool surface for the session. Default: 'all'. */
  platformTools?: PlatformToolPolicy;
  onUpdate?: (text: string) => void;
}

interface ExecuteSingleRunOptions {
  params: SingleRunParams;
  settings: SubagentSettings;
  pool: ConcurrencyPool;
  tracker: SubagentTracker;
  deps: RunnerDeps;
  resolveAgent: (agentName?: string, systemPrompt?: string) => Promise<AgentConfig>;
}

export interface SingleRunResult {
  response: string;
  error?: string;
  /** Concrete model id the session ran with (when resolvable). */
  modelId?: string;
  /** Provider id for modelId — model ids are not globally unique. */
  providerId?: string;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs?: number;
  /** Token usage totals. */
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

/**
 * Shared single-run execution path used by both runSingle() and
 * runSingleStructured() in the SubagentManager façade.
 */
export async function executeSingleRun(options: ExecuteSingleRunOptions): Promise<SingleRunResult> {
  const { params, settings, pool, tracker, deps, resolveAgent } = options;
  const { task, parentSessionId, workspaceId, onUpdate } = params;

  let agent: AgentConfig;
  try {
    agent = await resolveAgent(params.agent, params.systemPrompt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onUpdate?.(`❌ ${params.agent ?? 'ad-hoc'} failed — ${msg}`);
    return { response: '', error: msg };
  }

  const callOverride: TaskOverride = {
    model: params.model,
    thinking: params.thinking,
    timeoutMs: params.timeoutMs,
  };

  const resolved = resolveConfig(
    undefined,
    callOverride,
    agent,
    settings,
    { model: undefined, thinking: undefined },
  );

  const runId = randomUUID();
  const controller = new AbortController();

  const entry: SubagentEntry = {
    id: runId,
    agentName: agent.name,
    taskPreview: task.slice(0, 200),
    status: 'running',
    startedAt: Date.now(),
    completedAt: null,
    durationMs: null,
    parentSessionId,
    workspaceId,
    mode: 'single',
    usage: { ...EMPTY_USAGE },
    model: resolved.model,
    toolActivity: [],
    liveOutput: '',
  };

  try {
    await pool.acquireSlot(runId, parentSessionId, controller);
    tracker.start(entry);
    onUpdate?.(`🔄 ${agent.name} started — "${task.slice(0, 80)}"`);

    const result = await runSubagent(
      {
        agent,
        task,
        resolved,
        workspaceId,
        parentSessionId,
        mode: 'single',
        signal: controller.signal,
        cwdOverride: params.cwd,
        isolated: params.isolated,
        customTools: params.customTools,
        platformTools: params.platformTools,
        onProgress: (usage) => tracker.progress(runId, usage),
        onToolActivity: (name, summary, running) =>
          tracker.updateToolActivity(runId, name, summary, running),
        onTextDelta: (delta) => tracker.appendLiveOutput(runId, delta),
        onUpdate,
      },
      deps,
    );

    const durationMs = Date.now() - entry.startedAt;
    const usage = {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    };

    if (result.error) {
      tracker.fail(runId, result.error, result.usage);
      onUpdate?.(`❌ ${agent.name} failed — ${result.error}`);
      return {
        response: '',
        error: result.error,
        modelId: result.modelId,
        providerId: result.providerId,
        durationMs,
        usage,
      };
    }

    tracker.complete(runId, result.response, result.usage);
    const durationSec = Math.round(durationMs / 1000);
    const tokenCount = result.usage.totalTokens;
    onUpdate?.(`✅ ${agent.name} completed (${durationSec}s, ${tokenCount} tokens)`);
    return {
      response: result.response,
      modelId: result.modelId,
      providerId: result.providerId,
      durationMs,
      usage,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker.fail(runId, msg);
    onUpdate?.(`❌ ${agent.name} failed — ${msg}`);
    return { response: '', error: msg, durationMs: Date.now() - entry.startedAt };
  } finally {
    pool.releaseSlot(runId, parentSessionId);
  }
}
