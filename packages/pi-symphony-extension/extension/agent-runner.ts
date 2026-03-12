/**
 * Pi SDK agent session runner.
 *
 * Creates lightweight in-memory AgentSessions via the Pi SDK to execute
 * work for each issue. Replaces the previous subprocess-based approach
 * with native SDK integration.
 */

import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { SessionConfig } from '../shared/types';
import type { RunPhase } from '../shared/types';
import { info, warn, error as logError } from './logger';

// ── Types ──────────────────────────────────────────────────────

export interface AgentCallbacks {
  onPhaseChange: (phase: RunPhase) => void;
  onTokenUpdate: (usage: TokenUsage) => void;
  onMessage: (message: string) => void;
  onEvent: (event: string, timestamp: string) => void;
  onSessionStarted: (sessionId: string) => void;
  onTurnComplete: (turnNumber: number, result: 'completed' | 'failed' | 'cancelled') => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentResult {
  success: boolean;
  turnCount: number;
  error: string | null;
  needsContinuation: boolean;
}

// ── Shared infrastructure (lazy singleton) ─────────────────────

let _authStorage: AuthStorage | null = null;
let _modelRegistry: ModelRegistry | null = null;

function getAgentDir(): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) return `${seroHome}/agent`;
  return `${process.env.HOME}/.sero-ui/agent`;
}

function ensureInfra(): { authStorage: AuthStorage; modelRegistry: ModelRegistry } {
  if (!_authStorage) {
    const agentDir = getAgentDir();
    _authStorage = AuthStorage.create(`${agentDir}/auth.json`);
    _modelRegistry = new ModelRegistry(_authStorage);
  }
  return { authStorage: _authStorage!, modelRegistry: _modelRegistry! };
}

// ── Agent runner ───────────────────────────────────────────────

export class AgentRunner {
  private config: SessionConfig;
  private session: AgentSession | null = null;
  private turnCount = 0;
  private aborted = false;
  private cumulativeUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(config: SessionConfig) {
    this.config = config;
  }

  get sessionId(): string | null {
    return this.session?.sessionId ?? null;
  }

  async run(
    prompt: string,
    workspaceCwd: string,
    callbacks: AgentCallbacks,
    turnNumber: number,
  ): Promise<AgentResult> {
    this.turnCount = turnNumber;
    this.aborted = false;

    callbacks.onPhaseChange('launching_agent');

    const { authStorage, modelRegistry } = ensureInfra();
    const agentDir = getAgentDir();

    // Resolve model — try modelRegistry.find() first (handles custom models),
    // then fall back to getModel() with a cast for built-in models.
    const model = modelRegistry.find('anthropic', this.config.model)
      ?? getModel('anthropic', this.config.model as Parameters<typeof getModel>[1]);
    if (!model) {
      logError('agent:model-not-found', { model: this.config.model });
      return { success: false, turnCount: this.turnCount, error: 'model_not_found', needsContinuation: false };
    }

    // Create resource loader with no extensions (Symphony is the orchestrator)
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 2 },
    });

    const loader = new DefaultResourceLoader({
      cwd: workspaceCwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await loader.reload();

    // Create tools scoped to workspace
    const tools = createCodingTools(workspaceCwd);

    callbacks.onPhaseChange('initializing_session');

    let session: AgentSession;
    try {
      const result = await createAgentSession({
        cwd: workspaceCwd,
        agentDir,
        model,
        thinkingLevel: this.config.thinking_level as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
        authStorage,
        modelRegistry,
        tools,
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(workspaceCwd),
        settingsManager,
      });
      session = result.session;
    } catch (err) {
      logError('agent:session-create-failed', { error: err instanceof Error ? err.message : String(err) });
      return { success: false, turnCount: this.turnCount, error: 'session_create_failed', needsContinuation: false };
    }

    this.session = session;

    info('agent:session-created', { sessionId: session.sessionId, cwd: workspaceCwd });
    callbacks.onSessionStarted(session.sessionId);
    callbacks.onPhaseChange('streaming_turn');

    return new Promise<AgentResult>((resolve) => {
      let resolved = false;
      let turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: AgentResult) => {
        if (resolved) return;
        resolved = true;
        if (turnTimeoutTimer) { clearTimeout(turnTimeoutTimer); turnTimeoutTimer = null; }
        unsubscribe();
        session.dispose();
        this.session = null;
        resolve(result);
      };

      // Turn timeout
      turnTimeoutTimer = setTimeout(() => {
        warn('agent:turn-timeout', { sessionId: session.sessionId });
        session.abort().catch(() => {});
        finish({ success: false, turnCount: this.turnCount, error: 'turn_timeout', needsContinuation: false });
      }, this.config.turn_timeout_ms);

      // Subscribe to session events
      const unsubscribe = session.subscribe((event) => {
        const now = new Date().toISOString();

        switch (event.type) {
          case 'turn_start':
            callbacks.onEvent('turn/start', now);
            break;

          case 'turn_end': {
            this.turnCount++;
            callbacks.onEvent('turn/end', now);
            callbacks.onTurnComplete(this.turnCount, 'completed');
            break;
          }

          case 'message_update': {
            const ame = event.assistantMessageEvent;
            if (ame.type === 'text_delta') {
              callbacks.onMessage(ame.delta.slice(0, 500));
            }
            break;
          }

          case 'message_end': {
            // Extract token usage from assistant messages
            const msg = event.message;
            if (msg && typeof msg === 'object' && 'role' in msg && msg.role === 'assistant') {
              const assistantMsg = msg as AssistantMessage;
              if (assistantMsg.usage) {
                this.cumulativeUsage.inputTokens += assistantMsg.usage.input;
                this.cumulativeUsage.outputTokens += assistantMsg.usage.output;
                this.cumulativeUsage.totalTokens += assistantMsg.usage.totalTokens;
                callbacks.onTokenUpdate({ ...this.cumulativeUsage });
              }
            }
            break;
          }

          case 'tool_execution_start':
            callbacks.onEvent(`tool/${event.toolName}`, now);
            break;

          case 'agent_end': {
            // agent_end means the agent finished naturally — no continuation needed.
            // Continuation is only for multi-turn protocols (not currently used).
            callbacks.onPhaseChange('finishing');
            finish({
              success: true,
              turnCount: this.turnCount,
              error: null,
              needsContinuation: false,
            });
            break;
          }

          default:
            break;
        }
      });

      // Run the prompt
      session.prompt(prompt).catch((err) => {
        if (this.aborted) return;
        logError('agent:prompt-error', { error: err instanceof Error ? err.message : String(err) });
        finish({
          success: false,
          turnCount: this.turnCount,
          error: err instanceof Error ? err.message : String(err),
          needsContinuation: false,
        });
      });
    });
  }

  kill(): void {
    this.aborted = true;
    if (!this.session) return;

    info('agent:killing', { sessionId: this.session.sessionId });

    this.session.abort().catch(() => {});
    this.session.dispose();
    this.session = null;
  }
}
