import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';

export type GroupedChatItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool-group'; tools: ChatToolCallMessage[]; id: string };

function isStreamingThinkingOnlyAssistantMessage(message: ChatMessage): boolean {
  return (
    message.type === 'assistant'
    && !message.text?.trim()
    && Boolean(message.thinking)
    && message.isStreaming
  );
}

function isSessionTitleToolCall(tool: ChatToolCallMessage): boolean {
  if (tool.toolName === 'set_session_title') return true;
  if (tool.toolName !== 'sero-cli' || typeof tool.input.command !== 'string') return false;

  const commands = tool.input.command
    .split('\n')
    .map((command) => command.trim())
    .filter(Boolean);
  if (commands.length !== 1) return false;

  const command = commands[0];
  if (!/^(?:sero\s+)?set-title(?:\s|$)/.test(command)) return false;

  // Only the automatic first-turn title carries --if-unnamed. An explicit
  // user-requested rename omits it and stays visible so the user sees it land.
  return /(?:^|\s)--if-unnamed(?:\s|$)/.test(command);
}

/** Groups consecutive tool messages into one collapsed block per turn. */
export function groupMessages(messages: ChatMessage[]): GroupedChatItem[] {
  const result: GroupedChatItem[] = [];
  let toolBuffer: ChatToolCallMessage[] = [];

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    result.push({
      kind: 'tool-group',
      tools: [...toolBuffer],
      id: `tg-${toolBuffer[0].id}`,
    });
    toolBuffer = [];
  };

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.type === 'tool') {
      if (isSessionTitleToolCall(message)) continue;
      toolBuffer.push(message);
      continue;
    }

    if (message.type === 'assistant' && !message.text?.trim()) {
      const isLastMessage = i === messages.length - 1;
      if (!isLastMessage || !isStreamingThinkingOnlyAssistantMessage(message)) continue;
    }

    flushTools();
    result.push({ kind: 'message', message });
  }
  flushTools();

  return result;
}

/** Returns true after a durable message follows the tool group. */
export function isToolGroupFinalized(items: GroupedChatItem[], index: number): boolean {
  for (let i = index + 1; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'message' && isStreamingThinkingOnlyAssistantMessage(item.message)) continue;
    return true;
  }
  return false;
}
