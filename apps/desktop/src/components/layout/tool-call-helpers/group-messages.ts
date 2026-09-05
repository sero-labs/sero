import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';

export type GroupedChatItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool-group'; tools: ChatToolCallMessage[]; id: string };

/**
 * Grouping result plus what the next incremental pass needs: the source array,
 * the message index each item starts at, and the last user text seen after
 * each item (for `previousUserText` on assistant rows).
 */
export interface GroupedChatSnapshot {
  messages: ChatMessage[];
  items: GroupedChatItem[];
  /** Index into `messages` of the first message in each item. */
  starts: number[];
  /** Index into `messages` just past the last message in each item. */
  ends: number[];
  /** Text of the last user message at or before each item. */
  lastUserText: (string | undefined)[];
}

const EMPTY_SNAPSHOT: GroupedChatSnapshot = {
  messages: [],
  items: [],
  starts: [],
  ends: [],
  lastUserText: [],
};

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

/** Append groups for `messages[from..]` to `out`, starting with an empty tool buffer. */
function groupFrom(messages: ChatMessage[], from: number, out: GroupedChatSnapshot): void {
  let toolBuffer: ChatToolCallMessage[] = [];
  let toolStart = -1;
  let toolEnd = -1;
  let lastUserText = out.lastUserText[out.items.length - 1];

  const push = (item: GroupedChatItem, start: number, end: number) => {
    out.items.push(item);
    out.starts.push(start);
    out.ends.push(end);
    out.lastUserText.push(lastUserText);
  };
  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    push({ kind: 'tool-group', tools: toolBuffer, id: `tg-${toolBuffer[0].id}` }, toolStart, toolEnd);
    toolBuffer = [];
  };

  for (let i = from; i < messages.length; i++) {
    const message = messages[i];

    if (message.type === 'tool') {
      if (isSessionTitleToolCall(message)) continue;
      if (toolBuffer.length === 0) toolStart = i;
      toolBuffer.push(message);
      toolEnd = i + 1;
      continue;
    }

    if (message.type === 'assistant' && !message.text?.trim()) {
      const isLastMessage = i === messages.length - 1;
      if (!isLastMessage || !isStreamingThinkingOnlyAssistantMessage(message)) continue;
    }

    flushTools();
    if (message.type === 'user') lastUserText = message.text;
    push({ kind: 'message', message }, i, i + 1);
  }
  flushTools();
}

/**
 * Regroup after a change, reusing every item that only depends on unchanged
 * messages. While streaming only the tail changes, so the work per update is
 * the size of the tail plus one reference comparison per earlier message.
 */
export function groupMessagesIncremental(
  previous: GroupedChatSnapshot | null,
  messages: ChatMessage[],
): GroupedChatSnapshot {
  const prev = previous ?? EMPTY_SNAPSHOT;
  if (prev.messages === messages) return prev;

  const shared = Math.min(prev.messages.length, messages.length);
  let divergeAt = 0;
  while (divergeAt < shared && prev.messages[divergeAt] === messages[divergeAt]) divergeAt += 1;
  if (divergeAt === prev.messages.length && divergeAt === messages.length) {
    return { ...prev, messages };
  }

  // Item k is settled when item k+1 was pushed from a message that is still
  // there: the message that closed k's tool group, or ended k's "is this the
  // last message" check, has not changed.
  let reusable = 0;
  while (reusable + 1 < prev.items.length && prev.starts[reusable + 1] < divergeAt) reusable += 1;

  const out: GroupedChatSnapshot = {
    messages,
    items: prev.items.slice(0, reusable),
    starts: prev.starts.slice(0, reusable),
    ends: prev.ends.slice(0, reusable),
    lastUserText: prev.lastUserText.slice(0, reusable),
  };
  groupFrom(messages, reusable > 0 ? prev.ends[reusable - 1] : 0, out);
  return out;
}

/** Groups consecutive tool messages into one collapsed block per turn. */
export function groupMessages(messages: ChatMessage[]): GroupedChatItem[] {
  return groupMessagesIncremental(null, messages).items;
}

/** Text of the user message that preceded the assistant item at `index`. */
export function previousUserTextAt(snapshot: GroupedChatSnapshot, index: number): string | undefined {
  const item = snapshot.items[index];
  if (item?.kind !== 'message' || item.message.type !== 'assistant') return undefined;
  return index > 0 ? snapshot.lastUserText[index - 1] : undefined;
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
