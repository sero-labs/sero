/**
 * Custom Promptfoo provider that wraps pi-coding-agent's SDK.
 *
 * Creates a headless agent session for evals, with:
 * - standard coding tools (read/bash/edit/write)
 * - a minimal eval-only `sero-cli` tool for Sero platform actions
 * - runtime API-key overrides so env vars beat stale OAuth state
 *
 * Uses dynamic import() for the SDK because it is ESM-only.
 *
 * SDK event shapes (from agent-subscription.ts):
 *   message_update       → { assistantMessageEvent: { type: 'text_delta', delta } }
 *   tool_execution_start → { toolCallId, toolName, args? }
 *   tool_execution_end   → { toolCallId, result, isError }
 */
import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { captureSessionSnapshot } from './helpers/sessionSnapshot';
import {
  createEvalPromptExtensionFactory,
  createEvalSeroCliTool,
  seedEvalWorkspace,
  stripExtensionTools,
} from './evalCli';
import { setupTempDir, teardownTempDir } from './setup';

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

const RUNTIME_API_KEY_ENV_VARS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  xai: ['XAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  'azure-openai-responses': ['AZURE_OPENAI_API_KEY'],
  huggingface: ['HF_TOKEN'],
  'vercel-ai-gateway': ['AI_GATEWAY_API_KEY'],
  zai: ['ZAI_API_KEY'],
  opencode: ['OPENCODE_API_KEY'],
  'opencode-go': ['OPENCODE_API_KEY'],
  'kimi-coding': ['KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  'minimax-cn': ['MINIMAX_CN_API_KEY'],
};

function getRuntimeEnvApiKey(providerId: string): string | undefined {
  const envVars = RUNTIME_API_KEY_ENV_VARS[providerId] ?? [];
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim();
    if (value) return value;
  }
  return undefined;
}

function applyRuntimeApiKeyOverrides(authStorage: any): string[] {
  const applied: string[] = [];
  for (const providerId of Object.keys(RUNTIME_API_KEY_ENV_VARS)) {
    const apiKey = getRuntimeEnvApiKey(providerId);
    if (!apiKey) continue;
    authStorage.setRuntimeApiKey(providerId, apiKey);
    applied.push(providerId);
  }
  return applied;
}

function buildAuthDiagnostics(
  authStorage: any,
  providerId: string | undefined,
  runtimeOverrideProviders: string[],
): string | undefined {
  if (!providerId) return undefined;

  const cred = authStorage.get(providerId);
  const errors = authStorage
    .drainErrors()
    .map((error: unknown) => (error instanceof Error ? error.message : String(error)));

  const parts = [
    `provider=${providerId}`,
    `runtimeOverride=${runtimeOverrideProviders.includes(providerId)}`,
    `authJsonType=${cred?.type ?? 'none'}`,
  ];

  if (cred?.type === 'oauth' && typeof cred.expires === 'number') {
    parts.push(`oauthExpires=${new Date(cred.expires).toISOString()}`);
  }
  if (errors.length > 0) {
    parts.push(`authErrors=${errors.join(' | ')}`);
  }

  return parts.join(', ');
}

// Lazy-loaded SDK modules (ESM-only)
let _sdk: {
  createAgentSession: any;
  SessionManager: any;
  DefaultResourceLoader: any;
  AuthStorage: any;
  ModelRegistry: any;
  SettingsManager: any;
  createCodingTools: any;
} | null = null;

async function loadSdk() {
  if (_sdk) return _sdk;
  const mod = await import('@earendil-works/pi-coding-agent');
  _sdk = {
    createAgentSession: mod.createAgentSession,
    SessionManager: mod.SessionManager,
    DefaultResourceLoader: mod.DefaultResourceLoader,
    AuthStorage: mod.AuthStorage,
    ModelRegistry: mod.ModelRegistry,
    SettingsManager: mod.SettingsManager,
    createCodingTools: mod.createCodingTools,
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

    let authStorage: any = null;
    let runtimeOverrideProviders: string[] = [];
    let activeModel: { provider?: string; id?: string } | undefined;

    try {
      await seedEvalWorkspace(tmpDir);

      const sdk = await loadSdk();

      authStorage = sdk.AuthStorage.create(`${agentDir}/auth.json`);
      runtimeOverrideProviders = applyRuntimeApiKeyOverrides(authStorage);

      const modelRegistry = new sdk.ModelRegistry(
        authStorage,
        `${agentDir}/models.json`,
      );
      const settingsManager = sdk.SettingsManager.create(agentDir, agentDir);
      const loader = new sdk.DefaultResourceLoader({
        cwd: tmpDir,
        agentDir,
        settingsManager,
        extensionFactories: [createEvalPromptExtensionFactory()],
        extensionsOverride: stripExtensionTools,
      });
      await loader.reload();

      const created = await sdk.createAgentSession({
        cwd: tmpDir,
        agentDir,
        authStorage,
        modelRegistry,
        tools: sdk.createCodingTools(tmpDir),
        customTools: [createEvalSeroCliTool(tmpDir)],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
      });
      const session = created.session;

      if (this.config.model) {
        await session.setModel(this.config.model);
      }
      activeModel = session.model;

      const snapshot = captureSessionSnapshot(session);
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
          runtimeOverrideProviders,
          model: activeModel,
        },
      };
    } catch (err: any) {
      const authDiagnostics = authStorage
        ? buildAuthDiagnostics(
            authStorage,
            activeModel?.provider,
            runtimeOverrideProviders,
          )
        : undefined;
      const details = authDiagnostics ? ` [${authDiagnostics}]` : '';
      return {
        error: `Agent error: ${err.message}${details}`,
      };
    } finally {
      await teardownTempDir(tmpDir);
    }
  }
}
