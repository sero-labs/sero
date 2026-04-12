/**
 * SubagentManager — public façade for the subagent system.
 *
 * Ties together discovery, concurrency pool, runner, and tracker.
 * Exposes runSingle(), runParallel(), runChain(), and management methods.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { randomUUID } from 'crypto';
import { discoverAgents } from './runtime/discovery';
import { ConcurrencyPool } from './core/pool';
import { SubagentTracker } from './core/tracker';
import { resolveConfig } from './core/resolve';
import { runSubagent, type RunnerDeps } from './runtime/runner';
import type {
  AgentConfig,
  SubagentEntry,
  SubagentSettings,
  SubagentUsage,
  TaskOverride,
} from './core/types';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import path from 'path';

export type { SubagentTrackerEvents } from './core/tracker';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');

const EMPTY_USAGE: SubagentUsage = {
  inputTokens: 0, outputTokens: 0,
  cacheReadTokens: 0, cacheWriteTokens: 0,
  totalTokens: 0, cost: 0,
};

interface RunSingleParams {
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
  onUpdate?: (text: string) => void;
}

interface ParallelTask {
  agent: string;
  task: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

interface ChainStep {
  agent: string;
  task: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

export class SubagentManager {
  private pool: ConcurrencyPool;
  readonly tracker: SubagentTracker;
  private deps: RunnerDeps | null = null;
  private settings: SubagentSettings;

  constructor(settings?: Partial<SubagentSettings>) {
    this.settings = {
      maxConcurrent: settings?.maxConcurrent ?? 4,
      maxTotal: settings?.maxTotal ?? 8,
      timeoutMs: settings?.timeoutMs ?? 600_000,
      toolStallTimeoutMs: settings?.toolStallTimeoutMs ?? 120_000,
      model: settings?.model ?? null,
      thinking: settings?.thinking ?? null,
      blockedExtensions: settings?.blockedExtensions ?? [],
    };
    this.pool = new ConcurrencyPool(this.settings.maxTotal, this.settings.maxConcurrent);
    this.tracker = new SubagentTracker();
  }

  /** Whether setDeps() has been called. */
  get isInitialized(): boolean {
    return this.deps !== null;
  }

  /** Lazily inject dependencies (avoids circular imports at module load). */
  setDeps(deps: RunnerDeps): void {
    this.deps = deps;
  }

  /** Update settings and pool limits. */
  updateSettings(settings: Partial<SubagentSettings>): void {
    Object.assign(this.settings, settings);
    this.pool.updateLimits(this.settings.maxTotal, this.settings.maxConcurrent);
  }

  // ── Discovery ──────────────────────────────────────────────

  async listAgents(): Promise<AgentConfig[]> {
    return discoverAgents(AGENTS_DIR);
  }

  // ── Single Mode ────────────────────────────────────────────

  async runSingle(params: RunSingleParams): Promise<string> {
    if (!this.deps) throw new Error('SubagentManager not initialized — call setDeps()');

    const { task, parentSessionId, workspaceId, onUpdate } = params;

    let agent: AgentConfig;
    try {
      agent = await this.resolveAgent(params.agent, params.systemPrompt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onUpdate?.(`❌ ${params.agent ?? 'ad-hoc'} failed — ${msg}`);
      return `Error: ${msg}`;
    }

    const callOverride: TaskOverride = {
      model: params.model,
      thinking: params.thinking,
      timeoutMs: params.timeoutMs,
    };

    const resolved = resolveConfig(
      undefined, callOverride, agent, this.settings,
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
      await this.pool.acquireSlot(runId, parentSessionId, controller);
      this.tracker.start(entry);
      onUpdate?.(`🔄 ${agent.name} started — "${task.slice(0, 80)}"`);

      const result = await runSubagent(
        {
          agent, task, resolved, workspaceId, parentSessionId,
          mode: 'single', signal: controller.signal,
          cwdOverride: params.cwd,
          isolated: params.isolated,
          customTools: params.customTools,
          onProgress: (usage) => this.tracker.progress(runId, usage),
          onToolActivity: (name, summary, running) => this.tracker.updateToolActivity(runId, name, summary, running),
          onTextDelta: (delta) => this.tracker.appendLiveOutput(runId, delta),
          onUpdate,
        },
        this.deps,
      );

      if (result.error) {
        this.tracker.fail(runId, result.error, result.usage);
        onUpdate?.(`❌ ${agent.name} failed — ${result.error}`);
        return `Error: ${result.error}`;
      }

      this.tracker.complete(runId, result.response, result.usage);
      const durationSec = Math.round((Date.now() - entry.startedAt) / 1000);
      const tokenCount = result.usage.totalTokens;
      onUpdate?.(`✅ ${agent.name} completed (${durationSec}s, ${tokenCount} tokens)`);
      return result.response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.tracker.fail(runId, msg);
      onUpdate?.(`❌ ${agent.name} failed — ${msg}`);
      return `Error: ${msg}`;
    } finally {
      this.pool.releaseSlot(runId, parentSessionId);
    }
  }

  /**
   * Like runSingle(), but returns a structured result instead of
   * embedding error signals in the response string.
   *
   * Use this when the caller needs to distinguish errors from
   * agent responses that happen to start with "Error:".
   */
  async runSingleStructured(params: RunSingleParams): Promise<{ response: string; error?: string }> {
    if (!this.deps) throw new Error('SubagentManager not initialized — call setDeps()');

    const { task, parentSessionId, workspaceId, onUpdate } = params;

    let agent: AgentConfig;
    try {
      agent = await this.resolveAgent(params.agent, params.systemPrompt);
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
      undefined, callOverride, agent, this.settings,
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
      await this.pool.acquireSlot(runId, parentSessionId, controller);
      this.tracker.start(entry);
      onUpdate?.(`🔄 ${agent.name} started — "${task.slice(0, 80)}"`);

      const result = await runSubagent(
        {
          agent, task, resolved, workspaceId, parentSessionId,
          mode: 'single', signal: controller.signal,
          cwdOverride: params.cwd,
          isolated: params.isolated,
          customTools: params.customTools,
          onProgress: (usage) => this.tracker.progress(runId, usage),
          onToolActivity: (name, summary, running) => this.tracker.updateToolActivity(runId, name, summary, running),
          onTextDelta: (delta) => this.tracker.appendLiveOutput(runId, delta),
          onUpdate,
        },
        this.deps,
      );

      if (result.error) {
        this.tracker.fail(runId, result.error, result.usage);
        onUpdate?.(`❌ ${agent.name} failed — ${result.error}`);
        return { response: '', error: result.error };
      }

      this.tracker.complete(runId, result.response, result.usage);
      const durationSec = Math.round((Date.now() - entry.startedAt) / 1000);
      const tokenCount = result.usage.totalTokens;
      onUpdate?.(`✅ ${agent.name} completed (${durationSec}s, ${tokenCount} tokens)`);
      return { response: result.response };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.tracker.fail(runId, msg);
      onUpdate?.(`❌ ${agent.name} failed — ${msg}`);
      return { response: '', error: msg };
    } finally {
      this.pool.releaseSlot(runId, parentSessionId);
    }
  }

  // ── Parallel Mode ──────────────────────────────────────────

  async runParallel(params: {
    tasks: ParallelTask[];
    model?: string;
    thinking?: string;
    timeoutMs?: number;
    parentSessionId: string;
    workspaceId: string;
    /** Restrict to own workspace only — no cross-workspace mounts in container. */
    isolated?: boolean;
    onUpdate?: (text: string) => void;
  }): Promise<string> {
    if (!this.deps) throw new Error('SubagentManager not initialized');
    const callGroup = randomUUID();

    const results = await Promise.allSettled(
      params.tasks.map(async (t, idx) => {
        const agent = await this.resolveAgent(t.agent);
        const taskOverride: TaskOverride = { model: t.model, thinking: t.thinking, timeoutMs: t.timeoutMs };
        const callOverride: TaskOverride = { model: params.model, thinking: params.thinking, timeoutMs: params.timeoutMs };
        const resolved = resolveConfig(taskOverride, callOverride, agent, this.settings);

        const runId = randomUUID();
        const controller = new AbortController();
        const entry: SubagentEntry = {
          id: runId, agentName: agent.name, taskPreview: t.task.slice(0, 200),
          status: 'running', startedAt: Date.now(), completedAt: null, durationMs: null,
          parentSessionId: params.parentSessionId, workspaceId: params.workspaceId,
          mode: 'parallel', usage: { ...EMPTY_USAGE }, model: resolved.model,
          toolActivity: [], liveOutput: '',
        };

        await this.pool.acquireSlot(runId, params.parentSessionId, controller, callGroup);
        this.tracker.start(entry);
        params.onUpdate?.(`🔄 ${agent.name} started — "${t.task.slice(0, 80)}"`);

        try {
          const result = await runSubagent(
            {
              agent, task: t.task, resolved, workspaceId: params.workspaceId,
              parentSessionId: params.parentSessionId, mode: 'parallel',
              signal: controller.signal,
              isolated: params.isolated,
              onProgress: (usage) => this.tracker.progress(runId, usage),
              onToolActivity: (name, summary, running) => this.tracker.updateToolActivity(runId, name, summary, running),
              onTextDelta: (delta) => this.tracker.appendLiveOutput(runId, delta),
              onUpdate: params.onUpdate,
            },
            this.deps!,
          );

          if (result.error) {
            this.tracker.fail(runId, result.error, result.usage);
            params.onUpdate?.(`❌ ${agent.name} failed — ${result.error}`);
            return { idx, agent: agent.name, task: t.task, response: `Error: ${result.error}`, error: true };
          }

          this.tracker.complete(runId, result.response, result.usage);
          const dur = Math.round((Date.now() - entry.startedAt) / 1000);
          params.onUpdate?.(`✅ ${agent.name} completed (${dur}s, ${result.usage.totalTokens} tokens)`);
          return { idx, agent: agent.name, task: t.task, response: result.response, error: false };
        } finally {
          this.pool.releaseSlot(runId, params.parentSessionId, callGroup);
        }
      }),
    );

    // Format results as labelled markdown sections
    const sections: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        sections.push(`## Result ${i + 1}: ${r.value.agent} — "${r.value.task.slice(0, 80)}"\n\n${r.value.response}`);
      } else {
        sections.push(`## Result ${i + 1}: Error\n\n${r.reason?.message ?? 'Unknown error'}`);
      }
    }
    return sections.join('\n\n');
  }

  // ── Chain Mode ─────────────────────────────────────────────

  async runChain(params: {
    chain: ChainStep[];
    model?: string;
    thinking?: string;
    timeoutMs?: number;
    parentSessionId: string;
    workspaceId: string;
    onUpdate?: (text: string) => void;
  }): Promise<string> {
    if (!this.deps) throw new Error('SubagentManager not initialized');

    let previousOutput = '';

    for (let step = 0; step < params.chain.length; step++) {
      const s = params.chain[step];
      const agent = await this.resolveAgent(s.agent);
      const taskOverride: TaskOverride = { model: s.model, thinking: s.thinking, timeoutMs: s.timeoutMs };
      const callOverride: TaskOverride = { model: params.model, thinking: params.thinking, timeoutMs: params.timeoutMs };
      const resolved = resolveConfig(taskOverride, callOverride, agent, this.settings);

      // Replace {previous} placeholder
      const task = s.task.replace(/\{previous\}/g, previousOutput);

      const runId = randomUUID();
      const controller = new AbortController();
      const entry: SubagentEntry = {
        id: runId, agentName: agent.name, taskPreview: task.slice(0, 200),
        status: 'running', startedAt: Date.now(), completedAt: null, durationMs: null,
        parentSessionId: params.parentSessionId, workspaceId: params.workspaceId,
        mode: 'chain', chainStep: step, usage: { ...EMPTY_USAGE }, model: resolved.model,
        toolActivity: [], liveOutput: '',
      };

      await this.pool.acquireSlot(runId, params.parentSessionId, controller);
      this.tracker.start(entry);
      params.onUpdate?.(`🔄 [Step ${step + 1}/${params.chain.length}] ${agent.name} started — "${task.slice(0, 80)}"`);

      try {
        const result = await runSubagent(
          {
            agent, task, resolved, workspaceId: params.workspaceId,
            parentSessionId: params.parentSessionId, mode: 'chain', chainStep: step,
            signal: controller.signal,
            onProgress: (usage) => this.tracker.progress(runId, usage),
            onToolActivity: (name, summary, running) => this.tracker.updateToolActivity(runId, name, summary, running),
            onTextDelta: (delta) => this.tracker.appendLiveOutput(runId, delta),
            onUpdate: params.onUpdate,
          },
          this.deps,
        );

        if (result.error) {
          this.tracker.fail(runId, result.error, result.usage);
          params.onUpdate?.(`❌ [Step ${step + 1}] ${agent.name} failed — ${result.error}`);
          return `Error at step ${step + 1}: ${result.error}`;
        }

        this.tracker.complete(runId, result.response, result.usage);
        const dur = Math.round((Date.now() - entry.startedAt) / 1000);
        params.onUpdate?.(`✅ [Step ${step + 1}] ${agent.name} completed (${dur}s, ${result.usage.totalTokens} tokens)`);
        previousOutput = result.response;
      } finally {
        this.pool.releaseSlot(runId, params.parentSessionId);
      }
    }

    return previousOutput;
  }

  // ── Management ─────────────────────────────────────────────

  abortAll(parentSessionId: string): void {
    this.tracker.abortByParentSession(parentSessionId);
    this.pool.abortAll(parentSessionId);
  }

  /** Abort a single subagent run by ID. Signals the AbortController and updates the tracker. */
  abortOne(subagentId: string): void {
    const aborted = this.pool.abortOne(subagentId);
    if (aborted) {
      this.tracker.abort(subagentId);
    }
  }

  snapshot(workspaceId: string): SubagentEntry[] {
    return this.tracker.snapshot(workspaceId);
  }

  clearCompleted(workspaceId: string): void {
    this.tracker.clearCompleted(workspaceId);
  }

  // ── Private ────────────────────────────────────────────────

  private async resolveAgent(agentName?: string, systemPrompt?: string): Promise<AgentConfig> {
    // Ad-hoc mode: inline system prompt, no discovery
    if (systemPrompt) {
      return {
        name: agentName || 'ad-hoc',
        description: 'Ad-hoc inline agent',
        systemPrompt,
        source: 'global',
        filePath: '',
      };
    }

    if (!agentName) {
      throw new Error('Either agent name or systemPrompt is required');
    }

    const agents = await discoverAgents(AGENTS_DIR);
    const found = agents.find((a) => a.name === agentName);
    if (!found) {
      throw new Error(`Agent '${agentName}' not found. Available: ${agents.map((a) => a.name).join(', ') || 'none'}`);
    }
    return found;
  }
}
