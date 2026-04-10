import type { AgentSession, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ToolResultMessage,
  Usage,
  UserMessage,
} from '@mariozechner/pi-ai';
import type { ChatAttachment, ChatMessage, ChatToolCallMessage, AgentStreamEvent, ToolResultImage } from '@/types/ipc';
import type { ChatCheckpointRef } from '@/types/checkpoints';
import { getCliRegistry } from '@electron/cli';
import type { CliContentBlock } from '@electron/cli/core';
import { createSeroCliTool, splitCommandLines } from '@electron/cli/core';
import { workspaceManager } from '@electron/shared/infra/shared-infra';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';
import { attachmentsToImages, nextId } from './agent-helpers';

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export interface PromptPoolEntry {
  session: AgentSession;
  workspaceId: string;
  lastCompletedCheckpoint: ChatCheckpointRef | null;
}

interface HandlePromptInputArgs {
  entry: PromptPoolEntry;
  sessionId: string;
  text: string;
  attachments?: ChatAttachment[];
  clientMessageId?: string;
  sendEvent: (event: AgentStreamEvent) => void;
}

interface ExecuteDirectCliPromptArgs {
  entry: PromptPoolEntry;
  sessionId: string;
  text: string;
  sendEvent: (event: AgentStreamEvent) => void;
  executeTool?: DirectCliToolExecute;
}

interface DirectCliToolResult {
  content?: CliContentBlock[];
  details?: unknown;
}

interface DirectCliToolUpdate {
  content: CliContentBlock[];
  details?: unknown;
}

export type DirectCliToolExecute = (args: {
  toolCallId: string;
  command: string;
  cwd: string;
  onUpdate?: (update: DirectCliToolUpdate) => void;
}) => Promise<DirectCliToolResult>;

export function isDirectSeroCliPrompt(
  text: string,
  attachments?: ChatAttachment[],
): boolean {
  if (attachments?.length) return false;

  const lines = splitCommandLines(text);
  if (lines.length === 0) return false;

  return lines.every((line) => {
    const normalized = line.trim().toLowerCase();
    return normalized === 'sero' || normalized.startsWith('sero ');
  });
}

export async function handlePromptInput({
  entry,
  sessionId,
  text,
  attachments,
  clientMessageId,
  sendEvent,
}: HandlePromptInputArgs): Promise<void> {
  const userMessageId = clientMessageId?.trim() || nextId();
  const userMsg: ChatMessage = { type: 'user', id: userMessageId, text, attachments };
  sendEvent({ type: 'message_start', sessionId, message: userMsg });

  if (entry.lastCompletedCheckpoint) {
    sendEvent({
      type: 'user_checkpoint',
      sessionId,
      userMessageId,
      checkpoint: entry.lastCompletedCheckpoint,
    });
    entry.lastCompletedCheckpoint = null;
  }

  if (isDirectSeroCliPrompt(text, attachments)) {
    await executeDirectCliPrompt({
      entry,
      sessionId,
      text,
      sendEvent,
    });
    return;
  }

  const images = attachmentsToImages(attachments);
  await entry.session.prompt(text, images ? { images } : undefined);
}

function handleDirectCliCompactResult(
  options: Parameters<ExtensionContext['compact']>[0] | undefined,
  result: Promise<unknown>,
): void {
  void result.then(
    (value) => options?.onComplete?.(value as never),
    (error: unknown) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      options?.onError?.(normalizedError);
    },
  );
}

export function buildDirectCliExtensionContext(
  entry: PromptPoolEntry,
  cwd: string,
): ExtensionContext {
  return {
    cwd,
    hasUI: true,
    ui: createSeroUIContext(),
    sessionManager: entry.session.sessionManager,
    modelRegistry: entry.session.modelRegistry,
    model: entry.session.model,
    isIdle: () => true,
    abort: () => {
      void entry.session.abort();
    },
    hasPendingMessages: () => false,
    shutdown: () => {
      void entry.session.abort();
    },
    getContextUsage: () => entry.session.getContextUsage() ?? undefined,
    compact: (options) => {
      handleDirectCliCompactResult(
        options,
        entry.session.compact(options?.customInstructions),
      );
    },
    getSystemPrompt: () => entry.session.agent.state.systemPrompt ?? '',
  };
}

export async function executeDirectCliPrompt({
  entry,
  sessionId,
  text,
  sendEvent,
  executeTool,
}: ExecuteDirectCliPromptArgs): Promise<void> {
  const toolCallId = `cli-${nextId()}`;
  const cwd = entry.session.sessionManager.getCwd() || workspaceManager.getPath(entry.workspaceId) || '';
  const toolInput = { command: text };
  const toolMessage: ChatToolCallMessage = {
    type: 'tool',
    id: nextId(),
    toolCallId,
    toolName: 'sero-cli',
    input: toolInput,
    output: null,
    details: null,
    isError: false,
    state: 'running',
  };

  appendMessage(entry.session, createUserMessage(text));
  appendMessage(entry.session, createToolCallAssistantMessage(entry.session, toolCallId, toolInput));

  sendEvent({ type: 'agent_start', sessionId });
  sendEvent({ type: 'tool_start', sessionId, tool: toolMessage });

  const runTool = executeTool ?? createDirectCliToolExecutor(entry, sessionId);

  try {
    const result = await runTool({
      toolCallId,
      command: text,
      cwd,
      onUpdate: (update) => {
        const view = toToolView(update.content, update.details);
        sendEvent({
          type: 'tool_update',
          sessionId,
          toolCallId,
          output: view.output,
          details: view.details,
          images: view.images,
        });
      },
    });

    const finalContent = normalizeCliContent(result.content);
    const finalView = toToolView(finalContent, result.details);
    appendMessage(entry.session, createToolResultMessage(toolCallId, finalContent, finalView.details, false));

    sendEvent({
      type: 'tool_end',
      sessionId,
      toolCallId,
      output: finalView.output,
      details: finalView.details,
      isError: false,
      images: finalView.images,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorContent: TextContent[] = [{ type: 'text', text: `ERROR: ${message}` }];
    const errorDetails = { exitCode: 1 };
    appendMessage(entry.session, createToolResultMessage(toolCallId, errorContent, errorDetails, true));

    sendEvent({
      type: 'tool_end',
      sessionId,
      toolCallId,
      output: `ERROR: ${message}`,
      details: errorDetails,
      isError: true,
    });
  } finally {
    sendEvent({ type: 'agent_end', sessionId });
  }
}

function createDirectCliToolExecutor(
  entry: PromptPoolEntry,
  sessionId: string,
): DirectCliToolExecute {
  const tool = createSeroCliTool(getCliRegistry(), entry.workspaceId, sessionId);
  return async ({ toolCallId, command, cwd, onUpdate }) => {
    // The Pi SDK ToolDefinition.execute has generic onUpdate/context params.
    // We bridge our DirectCliToolUpdate → the SDK's expected shape. The SDK
    // accepts any callback with matching content/details shape, but the
    // generic types don't narrow without the full ToolDefinition generic param.
    const bridgedOnUpdate = onUpdate
      ? (update: { content: CliContentBlock[]; details?: unknown }) => onUpdate({
          content: update.content,
          details: update.details,
        })
      : undefined;

    return tool.execute(
      toolCallId,
      { command },
      undefined,
      bridgedOnUpdate as Parameters<typeof tool.execute>[3],
      buildDirectCliExtensionContext(entry, cwd) as Parameters<typeof tool.execute>[4],
    );
  };
}

function appendMessage(session: AgentSession, message: Message): void {
  session.agent.appendMessage(message);
  session.sessionManager.appendMessage(message);
}

function createUserMessage(text: string): UserMessage {
  return {
    role: 'user',
    content: text,
    timestamp: Date.now(),
  };
}

function createToolCallAssistantMessage(
  session: AgentSession,
  toolCallId: string,
  input: Record<string, unknown>,
): AssistantMessage {
  const currentModel = session.model;
  return {
    role: 'assistant',
    content: [{ type: 'toolCall', id: toolCallId, name: 'sero-cli', arguments: input }],
    api: currentModel?.api ?? 'anthropic-messages',
    provider: currentModel?.provider ?? 'anthropic',
    model: currentModel?.id ?? 'direct-sero-cli',
    usage: ZERO_USAGE,
    stopReason: 'toolUse',
    timestamp: Date.now(),
  };
}

function createToolResultMessage(
  toolCallId: string,
  content: Array<TextContent | ImageContent>,
  details: Record<string, unknown> | null,
  isError: boolean,
): ToolResultMessage<Record<string, unknown> | null> {
  return {
    role: 'toolResult',
    toolCallId,
    toolName: 'sero-cli',
    content,
    details,
    isError,
    timestamp: Date.now(),
  };
}

function normalizeCliContent(
  content: CliContentBlock[] | undefined,
): Array<TextContent | ImageContent> {
  if (!content?.length) return [];

  const normalized: Array<TextContent | ImageContent> = [];
  for (const block of content) {
    if (block.type === 'text') {
      normalized.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'image') {
      normalized.push({ type: 'image', data: block.data, mimeType: block.mimeType });
    }
  }
  return normalized;
}

function toToolView(
  content: Array<TextContent | ImageContent> | undefined,
  details: unknown,
): {
  output: string | null;
  details: Record<string, unknown> | null;
  images?: ToolResultImage[];
} {
  const textParts = content?.filter((block): block is TextContent => block.type === 'text') ?? [];
  const imageParts = content?.filter((block): block is ImageContent => block.type === 'image') ?? [];
  const output = textParts.map((block) => block.text).join('\n') || null;
  const normalizedDetails = isRecord(details) ? details : null;
  const images = imageParts.length > 0
    ? imageParts.map((block) => ({
        data: block.data,
        mimeType: block.mimeType,
        description: output ?? undefined,
      }))
    : undefined;

  return {
    output,
    details: normalizedDetails,
    images,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
