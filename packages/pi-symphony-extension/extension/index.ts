/**
 * Symphony Extension — Pi extension for orchestrating agent sessions via Pi SDK.
 *
 * Global-scoped: state at ~/.sero-ui/apps/symphony/state.json (Sero)
 * or .sero/apps/symphony/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: symphony (start, stop, status, refresh, config, issues)
 * Commands: /symphony
 *
 * The orchestrator is a MODULE-LEVEL singleton. The default export
 * may be called multiple times (once per Sero session), but only one
 * orchestrator exists per process.
 */

import path from 'node:path';
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { SymphonyState, SymphonyConfig } from '../shared/types';
import { resolveStatePath, withStateLock, readState, writeState } from './state-io';
import { loadWorkflow } from './workflow-loader';
import { parseConfig, validateConfig } from './config';
import { Orchestrator } from './orchestrator';
import { StateWatcher } from './state-watcher';
import { initLogger, setLogPath, info, warn, error as logError } from './logger';

// ── Module-level singleton state ───────────────────────────────

let statePath = '';
let workspaceCwd = '';
let orchestrator: Orchestrator | null = null;
let stateWatcher: StateWatcher | null = null;
let workflowWatcher: FSWatcher | null = null;
let initialized = false;
let sessionRefCount = 0;
let currentConfig: SymphonyConfig | null = null;
let currentPromptTemplate = '';
let workflowPath: string | null = null;
let workflowValid = false;
let workflowError: string | null = null;

function getOrchestrator(): Orchestrator | null {
  return orchestrator;
}

// ── Workflow loading ───────────────────────────────────────────

async function loadAndApplyWorkflow(wfPath: string): Promise<void> {
  try {
    const wf = await loadWorkflow(wfPath);
    const config = parseConfig(wf.config);
    const errors = validateConfig(config);

    if (errors.length > 0) {
      workflowValid = false;
      workflowError = errors.join('; ');
      warn('workflow:validation-errors', { errors });
      return;
    }

    currentConfig = config;
    currentPromptTemplate = wf.promptTemplate;
    workflowValid = true;
    workflowError = null;

    // Hot-reload orchestrator if running
    if (orchestrator?.isActive()) {
      orchestrator.reload(config, wf.promptTemplate);
    }

    info('workflow:loaded', { path: wfPath });
  } catch (err) {
    workflowValid = false;
    workflowError = err instanceof Error ? err.message : String(err);
    logError('workflow:load-failed', { error: workflowError });
  }
}

function startWorkflowWatcher(wfPath: string): void {
  if (workflowWatcher) {
    workflowWatcher.close();
    workflowWatcher = null;
  }

  try {
    const dir = path.dirname(wfPath);
    const filename = path.basename(wfPath);

    workflowWatcher = watch(dir, { persistent: false }, (_event, changed) => {
      if (changed === filename) {
        info('workflow:file-changed');
        loadAndApplyWorkflow(wfPath).catch(() => {});
      }
    });
  } catch {
    // Directory may not exist yet
  }
}

// ── State snapshot ─────────────────────────────────────────────

function buildState(): SymphonyState {
  const base = orchestrator?.getState();
  return {
    serviceActive: orchestrator?.isActive() ?? false,
    workflowPath,
    workflowValid,
    workflowError,
    pollIntervalMs: base?.pollIntervalMs ?? currentConfig?.polling.interval_ms ?? 30_000,
    maxConcurrentAgents: base?.maxConcurrentAgents ?? currentConfig?.agent.max_concurrent ?? 2,
    running: base?.running ?? [],
    retrying: base?.retrying ?? [],
    completed: base?.completed ?? [],
    agentTotals: base?.agentTotals ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: base?.rateLimits ?? null,
    lastPollAt: base?.lastPollAt ?? null,
    lastError: base?.lastError ?? null,
    trackerKind: base?.trackerKind ?? currentConfig?.tracker.kind ?? null,
    trackerLabel: base?.trackerLabel ?? null,
  };
}

async function persistState(): Promise<void> {
  if (!statePath) return;
  await withStateLock(async () => {
    stateWatcher?.markOwnWrite();
    await writeState(statePath, buildState());
  });
}

// ── Start / Stop ───────────────────────────────────────────────

async function startOrchestrator(): Promise<string> {
  if (orchestrator?.isActive()) return 'Symphony is already running.';
  if (!currentConfig) return 'Error: no WORKFLOW.md loaded. Place one in the workspace root.';
  if (!workflowValid) return `Error: workflow invalid — ${workflowError}`;

  orchestrator = new Orchestrator(currentConfig, currentPromptTemplate);
  orchestrator.start((state) => {
    persistState().catch(() => {});
  });

  await persistState();

  if (statePath) {
    stateWatcher?.stop();
    stateWatcher = new StateWatcher(statePath, getOrchestrator);
    stateWatcher.start();
  }

  info('symphony:started');
  return 'Symphony started.';
}

async function stopOrchestrator(): Promise<string> {
  if (!orchestrator?.isActive()) return 'Symphony is not running.';

  stateWatcher?.stop();
  stateWatcher = null;
  orchestrator.stop();
  orchestrator = null;

  await persistState();

  info('symphony:stopped');
  return 'Symphony stopped.';
}

// ── Initialization ─────────────────────────────────────────────

async function ensureInitialized(cwd: string): Promise<void> {
  if (initialized) return;
  initialized = true;

  statePath = resolveStatePath(cwd);
  workspaceCwd = cwd;
  info('init', { cwd, statePath });

  // Look for WORKFLOW.md
  const wfPath = path.join(cwd, 'WORKFLOW.md');
  workflowPath = wfPath;
  await loadAndApplyWorkflow(wfPath);
  startWorkflowWatcher(wfPath);
}

// ── Tool parameter schema ──────────────────────────────────────

const SymphonyParams = Type.Object({
  action: StringEnum(['start', 'stop', 'status', 'refresh', 'config', 'issues'] as const),
});

// ── Extension factory ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  console.log('[symphony] extension loaded');

  if (statePath) initLogger(pi, statePath);

  // Eager init in Sero mode
  const seroHome = process.env.SERO_HOME;
  if (seroHome && !initialized) {
    const globalCwd = path.join(seroHome, 'workspaces', 'global');
    initLogger(pi, resolveStatePath(globalCwd));
    ensureInitialized(globalCwd).catch((err) => {
      console.error('[symphony] eager init failed:', err);
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    if (!initialized) initLogger(pi, resolveStatePath(ctx.cwd));
    await ensureInitialized(ctx.cwd);
    sessionRefCount++;
    info('session:start', { cwd: ctx.cwd, refCount: sessionRefCount });
  });

  pi.on('session_switch', async (_event, ctx) => {
    const newPath = resolveStatePath(ctx.cwd);
    if (newPath === statePath) {
      setLogPath(statePath);
    }
    info('session:switch', { cwd: ctx.cwd });
  });

  pi.on('session_shutdown', async () => {
    sessionRefCount = Math.max(0, sessionRefCount - 1);
    info('session:shutdown', { refCount: sessionRefCount });

    if (sessionRefCount === 0) {
      stateWatcher?.stop();
      stateWatcher = null;
      workflowWatcher?.close();
      workflowWatcher = null;
      if (orchestrator?.isActive()) { orchestrator.stop(); orchestrator = null; }
      initialized = false;
    }
  });

  // ── Tool: symphony ────────────────────────────────────────

  pi.registerTool({
    name: 'symphony',
    label: 'Symphony',
    description:
      'Orchestrate Pi SDK agent sessions for issues. Actions: start (begin polling), stop, status, refresh (immediate poll), config (show config), issues (list active).',
    parameters: SymphonyParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (ctx?.cwd) await ensureInitialized(ctx.cwd);

      const result = await handleAction(params.action);
      return { content: [{ type: 'text' as const, text: result }], details: {} };
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('symphony '));
      text += theme.fg('muted', args.action);
      return new Text(text, 0, 0);
    },

    renderResult(result, _o, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('Error:')) return new Text(theme.fg('error', msg), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /symphony ────────────────────────────────────

  pi.registerCommand('symphony', {
    description: 'Symphony orchestrator: /symphony start | stop | status',
    handler: async (args, ctx) => {
      if (ctx.cwd) await ensureInitialized(ctx.cwd);
      const arg = args?.trim().toLowerCase();
      if (arg === 'start') {
        const r = await startOrchestrator();
        ctx.ui?.notify(r, r.startsWith('Error') ? 'error' : 'info');
      } else if (arg === 'stop') {
        const r = await stopOrchestrator();
        ctx.ui?.notify(r, r.startsWith('Error') ? 'error' : 'info');
      } else {
        const state = buildState();
        const msg = `Symphony: ${state.serviceActive ? 'active' : 'inactive'} · Running: ${state.running.length} · Retrying: ${state.retrying.length}`;
        ctx.ui?.notify(msg, 'info');
      }
    },
  });
}

// ── Action handler ─────────────────────────────────────────────

async function handleAction(action: string): Promise<string> {
  switch (action) {
    case 'start':
      return startOrchestrator();

    case 'stop':
      return stopOrchestrator();

    case 'status': {
      const state = buildState();
      const lines = [
        `Service: ${state.serviceActive ? 'active' : 'inactive'}`,
        `Tracker: ${state.trackerKind ?? 'none'} (${state.trackerLabel ?? 'unconfigured'})`,
        `Workflow: ${state.workflowValid ? 'valid' : `invalid — ${state.workflowError}`}`,
        `Running: ${state.running.length}/${state.maxConcurrentAgents}`,
        `Retrying: ${state.retrying.length}`,
        `Completed: ${state.completed.length}`,
        `Tokens: ${state.agentTotals.totalTokens} total`,
      ];
      return lines.join('\n');
    }

    case 'refresh':
      if (!orchestrator?.isActive()) return 'Error: Symphony is not running.';
      await orchestrator.refresh();
      return 'Poll cycle triggered.';

    case 'config': {
      if (!currentConfig) return 'No config loaded.';
      return JSON.stringify(currentConfig, null, 2);
    }

    case 'issues': {
      const state = buildState();
      if (state.running.length === 0 && state.retrying.length === 0) {
        return 'No active issues.';
      }
      const lines: string[] = [];
      for (const r of state.running) {
        lines.push(`[${r.phase}] ${r.identifier}: ${r.issue.title} (turn ${r.turnCount})`);
      }
      for (const r of state.retrying) {
        const dueIn = Math.max(0, Math.floor((r.dueAtMs - Date.now()) / 1000));
        lines.push(`[retry #${r.attempt}] ${r.identifier}: due in ${dueIn}s`);
      }
      return lines.join('\n');
    }

    default:
      return `Unknown action: ${action}`;
  }
}
