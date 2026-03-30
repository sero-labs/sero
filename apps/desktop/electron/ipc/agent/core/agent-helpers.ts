/**
 * Agent IPC helpers — validation, conversion, provider metadata.
 *
 * Extracted from agent.ts to keep individual files under 500 LOC.
 */

import type { AgentSession, DefaultResourceLoader } from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { ImageContent } from '@mariozechner/pi-ai';
import { promises as fs } from 'fs';
import type {
  ChatMessage,
  ChatAttachment,
  ChatAssistantMessage,
  ChatToolCallMessage,
  SeroSlashCommandInfo,
  SessionModelState,
  ToolResultImage,
} from '../../../../src/types/ipc';
import type { ChatCheckpointRef } from '../../../../src/types/checkpoints';
import { resizeImageForApi } from '../../../shared/media/image-resize';
import { tryParseImageJson } from './agent-subscription';
import { extractOriginalCollaborationQuery } from '../../collaboration/collaboration-message';

// ── ID generation ────────────────────────────────────────────

let msgCounter = 0;
export function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

// ── Custom message formatting ────────────────────────────────

/**
 * Extract display text from a custom SDK message.
 * Returns null if the message should not be displayed.
 */
export function formatCustomMessage(msg: {
  display?: boolean;
  customType?: string;
  content?: unknown;
}): string | null {
  const display = msg.display ?? true;
  if (!display) return null;

  const customType = String(msg.customType ?? '').trim();
  const content = msg.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((c): c is { type: 'text'; text: string } => c?.type === 'text')
            .map((c) => c.text)
            .join('\n')
        : '';
  const prefixed = customType ? `[${customType}] ${text}` : text;
  return prefixed.trim() ? prefixed : null;
}

const CHECKPOINT_ENTRY = 'git-checkpoint';

/**
 * Find the session entry ID of a `git-checkpoint` custom entry by changeId.
 *
 * With the shifted checkpoint mapping (user message N displays the checkpoint
 * from turn N-1), branching to the checkpoint entry itself keeps turns 0..N-1
 * visible in the chat and hides turn N onward.
 *
 * Returns `null` if no matching checkpoint entry exists.
 */
export function findCheckpointEntryId(
  session: AgentSession,
  changeId: string,
): string | null {
  const entries = session.sessionManager.getEntries();
  for (const e of entries) {
    if (e.type === 'custom' && e.customType === CHECKPOINT_ENTRY) {
      const data = e.data as Record<string, unknown> | undefined;
      if (data?.changeId === changeId) {
        return e.id;
      }
    }
  }
  return null;
}

function asCheckpointRef(data: unknown): ChatCheckpointRef | null {
  if (!data || typeof data !== 'object') return null;

  const value = data as Record<string, unknown>;
  const changeId = typeof value.changeId === 'string' ? value.changeId.trim() : '';
  if (!changeId) return null;

  return {
    changeId,
    description: typeof value.description === 'string' ? value.description : '(no description)',
    source: typeof value.source === 'string' ? value.source : 'turn',
    createdAt: typeof value.recordedAt === 'string' ? value.recordedAt : new Date().toISOString(),
  };
}

/** Build mapping: user turn index -> checkpoint metadata from session custom entries. */
export function buildCheckpointMapByTurn(
  session: AgentSession,
  workspaceId?: string,
): Map<number, ChatCheckpointRef> {
  const result = new Map<number, ChatCheckpointRef>();
  const branch = session.sessionManager.getBranch();
  let currentTurn = -1;

  for (const entry of branch) {
    if (entry.type === 'message' && entry.message.role === 'user') {
      currentTurn++;
      continue;
    }

    if (entry.type !== 'custom' || entry.customType !== CHECKPOINT_ENTRY) continue;

    const checkpoint = asCheckpointRef(entry.data);
    if (!checkpoint) continue;
    if (checkpoint.source !== 'turn') continue;

    if (workspaceId && typeof entry.data === 'object' && entry.data) {
      const ws = (entry.data as Record<string, unknown>).workspaceId;
      if (typeof ws === 'string' && ws && ws !== workspaceId) continue;
    }

    result.set(currentTurn, checkpoint);
  }

  return result;
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

export function validateProvider(provider: string): string {
  const normalized = provider.trim();
  if (!normalized) {
    throw new Error('Provider is required');
  }
  return normalized;
}

// ── Message conversion ───────────────────────────────────────

export function convertSessionMessages(
  messages: ReturnType<AgentSession['agent']['state']['messages']['slice']>,
  checkpointsByTurn?: Map<number, ChatCheckpointRef>,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  let userTurn = -1;

  for (const msg of messages) {
    if (msg.role === 'user') {
      userTurn++;
      const rawText =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
      // Strip collaboration injection wrapper so the UI shows the original query
      const text = extractOriginalCollaborationQuery(rawText);

      // Restore image attachments so they survive session reload.
      // The Pi SDK stores user images as { type: 'image', data, mimeType } blocks.
      let attachments: ChatAttachment[] | undefined;
      if (typeof msg.content !== 'string') {
        for (const block of msg.content) {
          if (block.type !== 'image') continue;
          const imgBlock = block as { type: 'image'; data: string; mimeType?: string };
          if (!attachments) attachments = [];
          const mime = imgBlock.mimeType ?? 'image/png';
          attachments.push({
            id: `att-${nextId()}`,
            filename: 'Image',
            mediaType: mime,
            url: `data:${mime};base64,${imgBlock.data}`,
          });
        }
      }

      // Shifted by one: user message N shows the checkpoint from the
      // *previous* turn (N-1). "Restore on message N" means "go back to
      // the state just before I sent message N", which is the end of turn N-1.
      const checkpoint = checkpointsByTurn?.get(userTurn - 1);
      result.push({
        type: 'user',
        id: nextId(),
        text,
        attachments,
        checkpoint,
      } as ChatMessage);
    } else if (msg.role === 'assistant') {
      const textParts = msg.content.filter(
        (c): c is { type: 'text'; text: string } => c.type === 'text',
      );
      const text = textParts.map((c) => c.text).join('');
      const thinkingParts = msg.content.filter(
        (c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking',
      );
      const thinking = thinkingParts.map((c) => c.thinking).join('') || undefined;

      if (text) {
        result.push({ type: 'assistant', id: nextId(), text, isStreaming: false, thinking });
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
        let details: Record<string, unknown> | null = null;
        let images: ToolResultImage[] | undefined;

        if (toolResult && toolResult.role === 'toolResult') {
          const textParts = toolResult.content
            .filter((c: { type: string }): c is { type: 'text'; text: string } => c.type === 'text');
          output = textParts.map((c) => c.text).join('\n') || null;
          isError = toolResult.isError;
          if (toolResult.details && typeof toolResult.details === 'object') {
            details = toolResult.details as Record<string, unknown>;
          }

          // Extract image content blocks (screenshots, browser captures).
          // toolResult.content items are a union; only image blocks have `data`.
          for (const block of toolResult.content) {
            if (block.type !== 'image') continue;
            const imgBlock = block as { type: 'image'; data: string; mimeType?: string };
            if (!images) images = [];
            images.push({
              data: imgBlock.data,
              mimeType: imgBlock.mimeType ?? 'image/png',
              description: output || undefined,
            });
          }

          // Also check if text output is a JSON-encoded image (sero-cli screenshot)
          if (!images && output) {
            const parsed = tryParseImageJson(output);
            if (parsed) {
              images = [parsed];
              output = parsed.description ?? null;
            }
          }
        }

        result.push({
          type: 'tool',
          id: nextId(),
          toolCallId: tc.id,
          toolName: tc.name,
          input: tc.arguments,
          output,
          isError,
          details,
          state: output !== null || images ? (isError ? 'error' : 'completed') : 'completed',
          images,
        });
      }
    } else if (msg.role === 'custom') {
      const prefixed = formatCustomMessage(msg as any);
      if (!prefixed) continue;
      result.push({ type: 'assistant', id: nextId(), text: prefixed, isStreaming: false });
    }
  }

  return result;
}

// ── Attachment conversion ────────────────────────────────────

/**
 * Convert ChatAttachments to ImageContent for the Pi SDK.
 *
 * Images are resized to stay within Anthropic's 5MB limit (max 2000×2000,
 * max 4.5MB with progressive JPEG compression). This mirrors the Pi CLI's
 * `resizeImage()` behaviour so pasted screenshots don't exceed the API limit.
 */
export function attachmentsToImages(attachments?: ChatAttachment[]): ImageContent[] | undefined {
  if (!attachments?.length) return undefined;

  const images: ImageContent[] = [];
  for (const att of attachments) {
    const mime = att.mediaType ?? '';
    if (!mime.startsWith('image/')) continue;

    const match = att.url.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) {
      console.warn(`[agent] attachment skipped: url is not a data URI (${att.filename})`);
      continue;
    }

    const resized = resizeImageForApi(match[1], mime);
    images.push({ type: 'image', data: resized.data, mimeType: resized.mimeType });
  }

  return images.length > 0 ? images : undefined;
}

// ── Provider metadata ────────────────────────────────────────

import { providerLogo, providerDisplayName } from '../../platform/auth';
export { providerLogo, providerDisplayName };

// ── Model state builder ──────────────────────────────────────

/** Subset of a pool entry needed by helper functions. */
export interface PoolEntryRef {
  session: AgentSession;
  loader: DefaultResourceLoader;
}

export function buildModelState(entry: Pick<PoolEntryRef, 'session'>): SessionModelState {
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

export function buildCommandList(entry: PoolEntryRef, hidden?: Set<string>): SeroSlashCommandInfo[] {
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

// ── Context override helpers ────────────────────────────────

/** Safely read _baseSystemPrompt from AgentSession (private SDK field). */
export function getBaseSystemPrompt(session: AgentSession): string | undefined {
  if (!('_baseSystemPrompt' in (session as any))) {
    console.warn(
      '[context-editor] _baseSystemPrompt not found on AgentSession — ' +
        'SDK version mismatch? Tested against pi-coding-agent@0.52.12.',
    );
    return undefined;
  }
  return (session as any)._baseSystemPrompt;
}

/** Safely write _baseSystemPrompt + update the agent's current prompt. */
export function setBaseSystemPrompt(session: AgentSession, prompt: string): void {
  if (!('_baseSystemPrompt' in (session as any))) {
    console.warn(
      '[context-editor] _baseSystemPrompt not found on AgentSession — ' +
        'SDK version mismatch? Tested against pi-coding-agent@0.52.12.',
    );
  }
  (session as any)._baseSystemPrompt = prompt;
  session.agent.setSystemPrompt(prompt);
}

/**
 * Strip disabled skills from the `<available_skills>` section of a system
 * prompt. Each skill is wrapped in `<skill><name>…</name>…</skill>`.
 */
export function stripDisabledSkills(prompt: string, disabled: Set<string>): string {
  return prompt.replace(
    /<skill>\s*\n\s*<name>([^<]+)<\/name>[\s\S]*?<\/skill>/g,
    (match, name: string) => (disabled.has(name.trim()) ? '' : match),
  );
}
