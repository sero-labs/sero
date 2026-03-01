/**
 * Transient session runner for cron jobs.
 *
 * Creates a fresh in-memory AgentSession for each job, runs the prompt,
 * collects the output, and disposes the session. No persistent session
 * files are created — this avoids orphaned sessions from repeated cron
 * runs and removes the dependency on an active user session.
 *
 * Uses the same Pi SDK infrastructure (auth, models, coding tools) as
 * the main Sero app, resolved from SERO_HOME/agent/.
 */

import path from 'node:path';
import os from 'node:os';
import {
  createAgentSession,
  SessionManager,
  createCodingTools,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';
import { getModel, type Model, type Api } from '@mariozechner/pi-ai';
import type { RunResult } from './scheduler';
import { info, warn, error as logError } from './logger';

// ── Cached infrastructure (singleton per process) ──────────────

interface CronInfra {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: ReturnType<typeof SettingsManager.create>;
  defaultModel: Model<Api>;
  agentDir: string;
}

let _infra: CronInfra | null = null;

function getAgentDir(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'agent');
}

async function ensureCronInfra(): Promise<CronInfra> {
  if (_infra) return _infra;

  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create(path.join(agentDir, 'auth.json'));
  const modelRegistry = new ModelRegistry(authStorage);
  const settingsManager = SettingsManager.create(agentDir, agentDir);

  // Use a capable but cost-effective default for background jobs
  const defaultModel = getModel('anthropic', 'claude-sonnet-4-5');
  if (!defaultModel) {
    throw new Error('Default cron model (claude-sonnet-4-5) not found in registry');
  }

  _infra = { authStorage, modelRegistry, settingsManager, defaultModel, agentDir };
  info('transient-session:infra-ready', { agentDir });
  return _infra;
}

// ── Model resolution ───────────────────────────────────────────

function resolveModel(
  pattern: string,
  registry: ModelRegistry,
  fallback: Model<Api>,
): Model<Api> {
  const available = registry.getAvailable();

  // Exact match on model ID
  const exact = available.find((m) => m.id === pattern);
  if (exact) return exact;

  // provider/modelId format (e.g. "anthropic/claude-sonnet-4-5")
  if (pattern.includes('/')) {
    const [provider, modelId] = pattern.split('/', 2);
    const match = available.find((m) => m.provider === provider && m.id === modelId);
    if (match) return match;
  }

  // Partial match (e.g. "sonnet" matches "claude-sonnet-4-5")
  const partial = available.find((m) => m.id.includes(pattern));
  if (partial) return partial;

  warn('transient-session:model-fallback', { pattern, reason: 'no match found' });
  return fallback;
}

// ── Transient job runner ───────────────────────────────────────

export interface TransientJobOptions {
  model?: string;
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Run a prompt in a transient in-memory agent session.
 *
 * Creates a fresh session with coding tools (file read/write, bash, etc.),
 * executes the prompt, collects the text output, then disposes everything.
 * The session exists only for the duration of this call.
 */
export async function runTransientJob(
  prompt: string,
  opts: TransientJobOptions = {},
): Promise<RunResult> {
  const { cwd, timeoutMs = 600_000 } = opts;
  const workDir = cwd || process.cwd();

  let infra: CronInfra;
  try {
    infra = await ensureCronInfra();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('transient-session:infra-failed', { error: msg });
    return { stdout: '', stderr: msg, exitCode: 1 };
  }

  // Resolve model
  const model = opts.model
    ? resolveModel(opts.model, infra.modelRegistry, infra.defaultModel)
    : infra.defaultModel;

  info('transient-session:create', {
    model: model.id,
    cwd: workDir,
    promptLen: prompt.length,
    timeoutMs,
  });

  const tools = createCodingTools(workDir);
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null;

  try {
    const result = await createAgentSession({
      cwd: workDir,
      agentDir: infra.agentDir,
      model,
      thinkingLevel: 'high',
      authStorage: infra.authStorage,
      modelRegistry: infra.modelRegistry,
      tools,
      sessionManager: SessionManager.inMemory(workDir),
      settingsManager: infra.settingsManager,
    });
    session = result.session;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('transient-session:create-failed', { error: msg });
    return { stdout: '', stderr: msg, exitCode: 1 };
  }

  // Collect text output
  let text = '';
  const unsub = session.subscribe((event) => {
    if (event.type === 'message_update') {
      const ame = event.assistantMessageEvent;
      if (ame.type === 'text_delta') text += ame.delta;
    }
  });

  try {
    await Promise.race([
      session.prompt(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Cron job timed out')), timeoutMs),
      ),
    ]);

    info('transient-session:complete', {
      model: model.id,
      outputLen: text.length,
    });

    return { stdout: text, stderr: '', exitCode: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('transient-session:error', { error: msg, outputLen: text.length });
    return { stdout: text, stderr: msg, exitCode: 1 };
  } finally {
    unsub();
    // Abort any in-flight work then dispose the session entirely
    await session.abort().catch(() => {});
    session.dispose();
    info('transient-session:disposed', { model: model.id });
  }
}
