/**
 * Custom Promptfoo provider that wraps pi-coding-agent's SDK.
 *
 * Creates a headless agent session (no Electron, no containers) and sends
 * the eval prompt through the same code path Sero's desktop app uses.
 *
 * Uses dynamic import() because the SDK is ESM-only and promptfoo's tsx
 * loader resolves via CJS by default.
 *
 * SDK event shapes (from agent-subscription.ts):
 *   message_update       → { assistantMessageEvent: { type: 'text_delta', delta } }
 *   tool_execution_start → { toolCallId, toolName, args? }
 *   tool_execution_end   → { toolCallId, result, isError }
 */
import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { setupTempDir, teardownTempDir } from './setup';
import { captureSessionSnapshot } from './helpers/sessionSnapshot';

const DEFAULT_AGENT_DIR =
  process.env.SERO_AGENT_DIR ?? `${process.env.HOME}/.sero-ui/agent`;

interface SeroProviderConfig {
  /** Override the model id (e.g. "claude-sonnet-4-5-20250929") */
  model?: string;
  /** Max milliseconds to wait for the agent to finish (default 120s) */
  timeout?: number;
  /** Agent directory — defaults to ~/.sero-ui/agent */
  agentDir?: string;
}

interface ToolCall {
  name: string;
  args: unknown;
}

// Lazy-loaded SDK modules (ESM-only)
let _sdk: {
  createAgentSession: any;
  SessionManager: any;
  DefaultResourceLoader: any;
  AuthStorage: any;
  ModelRegistry: any;
  SettingsManager: any;
} | null = null;

async function loadSdk() {
  if (_sdk) return _sdk;
  const mod = await import('@mariozechner/pi-coding-agent');
  _sdk = {
    createAgentSession: mod.createAgentSession,
    SessionManager: mod.SessionManager,
    DefaultResourceLoader: mod.DefaultResourceLoader,
    AuthStorage: mod.AuthStorage,
    ModelRegistry: mod.ModelRegistry,
    SettingsManager: mod.SettingsManager,
  };
  return _sdk;
}

export default class SeroProvider implements ApiProvider {
  private config: SeroProviderConfig;

  constructor(opts: { config?: SeroProviderConfig; id?: string } = {}) {
    this.config = {
      timeout: 120_000,
      ...opts.config,
    };
  }

  id(): string {
    return `sero:${this.config.model ?? 'default'}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const agentDir = this.config.agentDir ?? DEFAULT_AGENT_DIR;
    const tmpDir = await setupTempDir();
    const start = Date.now();

    try {
      const sdk = await loadSdk();

      // Initialise SDK infra — mirrors shared-infra.ts but headless
      const authStorage = sdk.AuthStorage.create(`${agentDir}/auth.json`);
      const modelRegistry = new sdk.ModelRegistry(
        authStorage,
        `${agentDir}/models.json`,
      );
      const settingsManager = sdk.SettingsManager.create(agentDir, agentDir);

      const loader = new sdk.DefaultResourceLoader({
        cwd: tmpDir,
        agentDir,
        settingsManager,
      });
      await loader.reload();

      const { session } = await sdk.createAgentSession({
        cwd: tmpDir,
        agentDir,
        authStorage,
        modelRegistry,
        tools: [],
        customTools: [],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
      });

      // Capture initial session state for prompt-caching assertions
      const snapshot = captureSessionSnapshot(session);

      // Collect events during the agent run
      const toolCalls: ToolCall[] = [];
      let fullText = '';

      const unsubscribe = session.subscribe((event: any) => {
        switch (event.type) {
          case 'message_update': {
            const ae = event.assistantMessageEvent;
            if (ae?.type === 'text_delta') {
              fullText += ae.delta;
            }
            break;
          }
          case 'tool_execution_start': {
            toolCalls.push({
              name: event.toolName,
              args: event.args ?? {},
            });
            break;
          }
        }
      });

      try {
        await Promise.race([
          session.prompt(prompt),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Agent timeout')),
              this.config.timeout,
            ),
          ),
        ]);
      } finally {
        unsubscribe();
      }

      const latencyMs = Date.now() - start;

      return {
        output: fullText,
        metadata: {
          latencyMs,
          toolCalls,
          toolCallCount: toolCalls.length,
          snapshot,
        },
      };
    } catch (err: any) {
      return {
        error: `Agent error: ${err.message}`,
      };
    } finally {
      await teardownTempDir(tmpDir);
    }
  }
}
