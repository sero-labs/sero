/**
 * Agent IPC helpers — validation, conversion, provider metadata.
 *
 * Extracted from agent.ts to keep individual files under 500 LOC.
 */

import type { AgentSession, DefaultResourceLoader } from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { ImageContent, KnownProvider } from '@mariozechner/pi-ai';
import { promises as fs } from 'fs';
import type {
  ChatMessage,
  ChatAttachment,
  ChatAssistantMessage,
  ChatToolCallMessage,
  SeroSlashCommandInfo,
  SessionModelState,
} from '../../src/types/ipc';

// ── ID generation ────────────────────────────────────────────

let msgCounter = 0;
export function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

// ── Validation ───────────────────────────────────────────────

const VALID_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh',
];

export function validateThinkingLevel(level: string): ThinkingLevel {
  const normalized = level.toLowerCase();
  if (VALID_THINKING_LEVELS.includes(normalized as ThinkingLevel)) {
    return normalized as ThinkingLevel;
  }
  throw new Error(
    `Invalid thinking level: "${level}". Valid levels: ${VALID_THINKING_LEVELS.join(', ')}`,
  );
}

const KNOWN_PROVIDERS: KnownProvider[] = [
  'amazon-bedrock', 'anthropic', 'google', 'google-gemini-cli', 'google-antigravity',
  'google-vertex', 'openai', 'azure-openai-responses', 'openai-codex', 'github-copilot',
  'xai', 'groq', 'cerebras', 'openrouter', 'vercel-ai-gateway', 'zai', 'mistral',
  'minimax', 'minimax-cn', 'huggingface', 'opencode', 'kimi-coding',
];

export function validateProvider(provider: string): KnownProvider {
  if (KNOWN_PROVIDERS.includes(provider as KnownProvider)) {
    return provider as KnownProvider;
  }
  throw new Error(`Unknown provider: "${provider}". Available: ${KNOWN_PROVIDERS.join(', ')}`);
}

// ── Message conversion ───────────────────────────────────────

export function convertSessionMessages(
  messages: ReturnType<AgentSession['agent']['state']['messages']['slice']>,
): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
      result.push({ type: 'user', id: nextId(), text });
    } else if (msg.role === 'assistant') {
      const textParts = msg.content.filter(
        (c): c is { type: 'text'; text: string } => c.type === 'text',
      );
      const text = textParts.map((c) => c.text).join('');

      if (text) {
        result.push({ type: 'assistant', id: nextId(), text, isStreaming: false });
      }

      const toolCalls = msg.content.filter(
        (c): c is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
          c.type === 'toolCall',
      );
      for (const tc of toolCalls) {
        if (tc.name === 'set_session_title') continue;

        const toolResult = messages.find(
          (m) => m.role === 'toolResult' && 'toolCallId' in m && m.toolCallId === tc.id,
        );
        let output: string | null = null;
        let isError = false;
        if (toolResult && toolResult.role === 'toolResult') {
          output = toolResult.content
            .filter((c: { type: string }): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c: { type: 'text'; text: string }) => c.text)
            .join('\n') || null;
          isError = toolResult.isError;
        }

        result.push({
          type: 'tool',
          id: nextId(),
          toolCallId: tc.id,
          toolName: tc.name,
          input: tc.arguments,
          output,
          isError,
          state: output !== null ? (isError ? 'error' : 'completed') : 'completed',
        });
      }
    }
  }

  return result;
}

// ── Attachment conversion ────────────────────────────────────

export function attachmentsToImages(attachments?: ChatAttachment[]): ImageContent[] | undefined {
  if (!attachments?.length) return undefined;

  const images: ImageContent[] = [];
  for (const att of attachments) {
    const mime = att.mediaType ?? '';
    if (!mime.startsWith('image/')) continue;

    const match = att.url.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) continue;

    images.push({ type: 'image', data: match[1], mimeType: mime });
  }

  return images.length > 0 ? images : undefined;
}

// ── Provider metadata ────────────────────────────────────────

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI (Codex)',
  google: 'Google',
  'google-gemini-cli': 'Google (Gemini CLI)',
  'google-antigravity': 'Antigravity',
  'google-vertex': 'Google Vertex',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  cerebras: 'Cerebras',
  mistral: 'Mistral',
  'github-copilot': 'GitHub Copilot',
  'amazon-bedrock': 'Amazon Bedrock',
  'azure-openai-responses': 'Azure OpenAI',
  huggingface: 'Hugging Face',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  zai: 'ZAI',
  opencode: 'OpenCode',
  'kimi-coding': 'Kimi',
};

const PROVIDER_LOGO_MAP: Record<string, string> = {
  'openai-codex': 'openai',
  'google-gemini-cli': 'google',
  'google-antigravity': 'google',
  'google-vertex': 'google-vertex',
  'azure-openai-responses': 'azure',
  'amazon-bedrock': 'amazon-bedrock',
  'github-copilot': 'github-copilot',
  'vercel-ai-gateway': 'vercel',
  'kimi-coding': 'openai',
};

function providerLogo(provider: string): string {
  const slug = PROVIDER_LOGO_MAP[provider] ?? provider;
  return `https://models.dev/logos/${slug}.svg`;
}

function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Model state builder ──────────────────────────────────────

export interface PoolEntryLike {
  session: AgentSession;
}

export function buildModelState(entry: PoolEntryLike): SessionModelState {
  const session = entry.session;
  const model = session.model;

  session.modelRegistry.authStorage.reload();

  const available = session.modelRegistry.getAvailable();
  const grouped = new Map<string, typeof available>();
  for (const m of available) {
    const list = grouped.get(m.provider) ?? [];
    list.push(m);
    grouped.set(m.provider, list);
  }

  const availableModels = [...grouped.entries()].map(([provider, models]) => ({
    provider,
    displayName: providerDisplayName(provider),
    logo: providerLogo(provider),
    models: models.map((m) => ({
      provider: m.provider,
      modelId: m.id,
      name: m.name,
      reasoning: m.reasoning,
    })),
  }));

  return {
    model: {
      provider: model?.provider ?? 'unknown',
      modelId: model?.id ?? 'unknown',
      name: model?.name ?? 'Unknown',
      reasoning: model?.reasoning ?? false,
    },
    thinkingLevel: session.thinkingLevel,
    availableThinkingLevels: session.getAvailableThinkingLevels(),
    supportsXhigh: session.supportsXhighThinking(),
    availableModels,
  };
}

// ── Hidden commands ──────────────────────────────────────────

/**
 * Read hiddenCommands from a settings config file.
 * Re-read on each call so edits take effect without restart.
 */
export async function readHiddenCommands(configPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (Array.isArray(config.hiddenCommands)) {
      return new Set(config.hiddenCommands as string[]);
    }
  } catch {
    // File missing or malformed — no hidden commands
  }
  return new Set();
}

// ── Slash command list builder ───────────────────────────────

export interface CommandListEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
}

export function buildCommandList(entry: CommandListEntry, hidden?: Set<string>): SeroSlashCommandInfo[] {
  const runtime = entry.session.extensionRunner;
  if (!runtime) return [];

  const extensionCommands = runtime.getRegisteredCommands();
  const extCmds: SeroSlashCommandInfo[] = extensionCommands.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    source: 'extension' as const,
  }));

  const { prompts } = entry.loader.getPrompts();
  const promptCmds: SeroSlashCommandInfo[] = prompts.map((p) => ({
    name: p.name,
    description: p.description,
    source: 'prompt' as const,
    path: p.source,
  }));

  const { skills } = entry.loader.getSkills();
  const skillCmds: SeroSlashCommandInfo[] = skills.map((s) => ({
    name: `skill:${s.name}`,
    description: s.description,
    source: 'skill' as const,
    path: s.filePath,
  }));

  const all = [...extCmds, ...promptCmds, ...skillCmds];
  if (!hidden || hidden.size === 0) return all;
  return all.filter((cmd) => !hidden.has(cmd.name));
}
