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
import { fileURLToPath } from 'node:url';
import type {
  AgentSession,
  AgentSessionEvent,
  ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import { captureSessionSnapshot } from './helpers/sessionSnapshot';
import {
  createEvalPromptExtensionFactory,
  createEvalSeroCliTool,
  seedEvalWorkspace,
  stripExtensionTools,
} from './evalCli';
import {
  runGraphifyEvalCommand,
  seedGraphifyEvalProfile,
} from './searchEvalGraphify';
import { setupTempDir, teardownTempDir } from './setup';

const DEFAULT_AGENT_DIR =
  process.env.SERO_AGENT_DIR ?? `${process.env.HOME}/.sero-ui/agent`;

interface SeroProviderConfig {
  /** Override the model id (e.g. "anthropic/claude-sonnet-4-5") */
  model?: string;
  /** Max milliseconds to wait for the agent to finish (default 120s) */
  timeout?: number;
  /** Agent directory — defaults to ~/.sero-ui/agent */
  agentDir?: string;
  /** Search tools exposed to the model for the search A/B evaluation. */
  searchMode?: 'bash' | 'fff' | 'graphify' | 'combined';
}

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
  startedAtMs: number;
  endedAtMs?: number;
  durationMs?: number;
  isError?: boolean;
  resultText?: string;
  resultTokensEstimate?: number;
}

const FFF_EXTENSION_PATH = fileURLToPath(
  new URL('../plugins/sero-fff-plugin/extension/index.ts', import.meta.url),
);
const GRAPHIFY_EXTENSION_PATH = fileURLToPath(
  new URL('../plugins/sero-graphify-plugin/extension/index.ts', import.meta.url),
);

function hasFff(mode: SeroProviderConfig['searchMode']): boolean {
  return mode === 'fff' || mode === 'combined';
}

function hasGraphify(mode: SeroProviderConfig['searchMode']): boolean {
  return mode === 'graphify' || mode === 'combined';
}

function toolResultText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result)) return '';
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: 'text'; text: string } => (
      Boolean(part)
      && typeof part === 'object'
      && 'type' in part
      && part.type === 'text'
      && 'text' in part
      && typeof part.text === 'string'
    ))
    .map((part) => part.text)
    .join('\n');
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

async function applyRuntimeApiKeyOverrides(modelRuntime: ModelRuntime): Promise<string[]> {
  const applied: string[] = [];
  for (const providerId of Object.keys(RUNTIME_API_KEY_ENV_VARS)) {
    const apiKey = getRuntimeEnvApiKey(providerId);
    if (!apiKey) continue;
    await modelRuntime.setRuntimeApiKey(providerId, apiKey);
    applied.push(providerId);
  }
  return applied;
}

function buildAuthDiagnostics(
  modelRuntime: ModelRuntime,
  providerId: string | undefined,
  runtimeOverrideProviders: string[],
): string | undefined {
  if (!providerId) return undefined;

  const authStatus = modelRuntime.getProviderAuthStatus(providerId);

  const parts = [
    `provider=${providerId}`,
    `runtimeOverride=${runtimeOverrideProviders.includes(providerId)}`,
    `authConfigured=${authStatus.configured}`,
    `authSource=${authStatus.source ?? 'none'}`,
  ];

  const runtimeError = modelRuntime.getError();
  if (runtimeError) parts.push(`authError=${runtimeError}`);

  return parts.join(', ');
}

// Lazy-loaded SDK modules (ESM-only)
let _sdk: typeof import('@earendil-works/pi-coding-agent') | null = null;

async function loadSdk() {
  if (_sdk) return _sdk;
  _sdk = await import('@earendil-works/pi-coding-agent');
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
    const configuredModel = this.config.model ?? process.env.SERO_EVAL_MODEL;
    const mode = this.config.searchMode ? `:${this.config.searchMode}` : '';
    return `sero:${configuredModel ?? 'default'}${mode}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const agentDir = this.config.agentDir ?? DEFAULT_AGENT_DIR;
    const configuredModel = this.config.model ?? process.env.SERO_EVAL_MODEL;
    const tmpDir = await setupTempDir();
    const profileDir = this.config.searchMode ? await setupTempDir() : undefined;
    const start = Date.now();
    const previousFinderAgentDir = process.env.PI_CODING_AGENT_DIR;
    const previousSeroHome = process.env.SERO_HOME;
    if (profileDir) {
      process.env.PI_CODING_AGENT_DIR = `${profileDir}/agent`;
      process.env.SERO_HOME = profileDir;
    }

    let modelRuntime: ModelRuntime | undefined;
    let runtimeOverrideProviders: string[] = [];
    let activeModel: { provider?: string; id?: string } | undefined;
    let session: AgentSession | undefined;

    try {
      const workspace = await seedEvalWorkspace(tmpDir, {
        includeSearchFixtures: Boolean(this.config.searchMode),
      });
      if (profileDir && hasGraphify(this.config.searchMode)) {
        await seedGraphifyEvalProfile(profileDir, workspace);
      }

      const sdk = await loadSdk();

      modelRuntime = await sdk.ModelRuntime.create({
        authPath: `${agentDir}/auth.json`,
        modelsPath: `${agentDir}/models.json`,
      });
      runtimeOverrideProviders = await applyRuntimeApiKeyOverrides(modelRuntime);
      const settingsManager = sdk.SettingsManager.create(tmpDir, agentDir);
      const loader = new sdk.DefaultResourceLoader({
        cwd: tmpDir,
        agentDir,
        settingsManager,
        extensionFactories: [createEvalPromptExtensionFactory({
          graphify: hasGraphify(this.config.searchMode),
        })],
        ...(this.config.searchMode
          ? {
              additionalExtensionPaths: [
                ...(hasFff(this.config.searchMode) ? [FFF_EXTENSION_PATH] : []),
                ...(hasGraphify(this.config.searchMode) ? [GRAPHIFY_EXTENSION_PATH] : []),
              ],
              noExtensions: true,
            }
          : { extensionsOverride: stripExtensionTools }),
      });
      await loader.reload();
      const extensionErrors = loader.getExtensions().errors;
      if (extensionErrors.length > 0) {
        throw new Error(
          `Eval extension load failed: ${extensionErrors.map((entry) => entry.error).join(' | ')}`,
        );
      }

      const created = await sdk.createAgentSession({
        cwd: tmpDir,
        agentDir,
        modelRuntime,
        ...(this.config.searchMode
          ? {
              tools: [
                'read',
                'bash',
                ...(hasFff(this.config.searchMode) ? ['find', 'grep', 'multi_grep'] : []),
                ...(hasGraphify(this.config.searchMode) ? ['sero-cli'] : []),
              ],
            }
          : {}),
        customTools: [createEvalSeroCliTool(tmpDir, {
          extraHelp: hasGraphify(this.config.searchMode)
            ? '  graphify_query | graphify_search | graphify_path | graphify_explain | graphify_status'
            : undefined,
          runExtensionCommand: profileDir && hasGraphify(this.config.searchMode)
            ? (tokens) => runGraphifyEvalCommand(tokens, profileDir, workspace.id)
            : undefined,
        })],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
      });
      session = created.session;
      await session.bindExtensions({});

      if (configuredModel) {
        const selectedModel = modelRuntime.getModels().find((model) => (
          model.id === configuredModel
          || `${model.provider}/${model.id}` === configuredModel
        ));
        if (!selectedModel) {
          throw new Error(`Configured eval model was not found: ${configuredModel}`);
        }
        await session.setModel(selectedModel);
      }
      activeModel = session.model;
      if (!activeModel) {
        throw new Error('No configured model is available for the evaluation session.');
      }

      const snapshot = captureSessionSnapshot(session);
      const toolCalls: ToolCall[] = [];
      let fullText = '';
      let agentError: string | undefined;

      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        switch (event.type) {
          case 'message_update': {
            const ae = event.assistantMessageEvent;
            if (ae?.type === 'text_delta') {
              fullText += ae.delta;
            } else if (ae?.type === 'error') {
              agentError = ae.error.errorMessage ?? 'The model request failed.';
            }
            break;
          }
          case 'tool_execution_start': {
            toolCalls.push({
              id: event.toolCallId,
              name: event.toolName,
              args: event.args ?? {},
              startedAtMs: Date.now() - start,
            });
            break;
          }
          case 'tool_execution_end': {
            const call = toolCalls.find((entry) => entry.id === event.toolCallId);
            if (!call) break;
            const resultText = toolResultText(event.result);
            call.endedAtMs = Date.now() - start;
            call.durationMs = call.endedAtMs - call.startedAtMs;
            call.isError = event.isError === true;
            call.resultText = resultText;
            call.resultTokensEstimate = Math.ceil(resultText.length / 4);
            break;
          }
        }
      });

      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          session.prompt(prompt),
          new Promise<never>((_, reject) =>
            timeout = setTimeout(
              () => reject(new Error('Agent timeout')),
              this.config.timeout,
            ),
          ),
        ]);
        if (agentError) throw new Error(agentError);

        const finalAssistant = session.state.messages.findLast(
          (message) => message.role === 'assistant',
        );
        if (finalAssistant?.role === 'assistant') {
          if (finalAssistant.stopReason === 'error') {
            throw new Error(finalAssistant.errorMessage ?? 'The model request failed.');
          }
          if (!fullText) {
            fullText = finalAssistant.content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('');
          }
        }
      } finally {
        if (timeout) clearTimeout(timeout);
        unsubscribe();
      }

      const latencyMs = Date.now() - start;

      return {
        output: fullText,
        metadata: {
          latencyMs,
          toolCalls,
          toolCallCount: toolCalls.length,
          searchMode: this.config.searchMode ?? 'default',
          usage: session.getSessionStats().tokens,
          snapshot,
          runtimeOverrideProviders,
          model: activeModel,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const authDiagnostics = modelRuntime
        ? buildAuthDiagnostics(
            modelRuntime,
            activeModel?.provider,
            runtimeOverrideProviders,
          )
        : undefined;
      const details = authDiagnostics ? ` [${authDiagnostics}]` : '';
      return {
        error: `Agent error: ${error.message}${details}`,
      };
    } finally {
      try {
        if (session) {
          await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
        }
      } finally {
        session?.dispose();
        if (previousFinderAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = previousFinderAgentDir;
        if (previousSeroHome === undefined) delete process.env.SERO_HOME;
        else process.env.SERO_HOME = previousSeroHome;
        await teardownTempDir(tmpDir);
        if (profileDir) await teardownTempDir(profileDir);
      }
    }
  }
}
