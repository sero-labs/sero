// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';
import {
  groupMessages,
  groupMessagesIncremental,
  previousUserTextAt,
  type GroupedChatSnapshot,
} from './group-messages';

let counter = 0;
const user = (text = `ask ${counter}`): ChatMessage => ({ type: 'user', id: `u${counter++}`, text });
const assistant = (text: string, extra: Partial<Extract<ChatMessage, { type: 'assistant' }>> = {}): ChatMessage => ({
  type: 'assistant', id: `a${counter++}`, text, isStreaming: false, ...extra,
});
const tool = (name = 'bash', extra: Partial<ChatToolCallMessage> = {}): ChatToolCallMessage => ({
  type: 'tool', id: `t${counter++}`, toolCallId: `call${counter}`, toolName: name,
  input: {}, output: null, isError: false, state: 'completed', ...extra,
});
const titleTool = (): ChatToolCallMessage => tool('set_session_title');

/** The `previousUserText` map the panel used to build from the full grouping. */
function fullPreviousUserText(messages: ChatMessage[]): (string | undefined)[] {
  const items = groupMessages(messages);
  let lastUserText: string | undefined;
  return items.map((item) => {
    if (item.kind === 'message' && item.message.type === 'user') {
      lastUserText = item.message.text;
      return undefined;
    }
    return item.kind === 'message' && item.message.type === 'assistant' ? lastUserText : undefined;
  });
}

function expectMatchesFullGrouping(snapshot: GroupedChatSnapshot) {
  expect(snapshot.items).toEqual(groupMessages(snapshot.messages));
  expect(snapshot.items.map((_, index) => previousUserTextAt(snapshot, index)))
    .toEqual(fullPreviousUserText(snapshot.messages));
}

describe('groupMessagesIncremental', () => {
  it('matches the full grouping across a streamed turn built one event at a time', () => {
    const steps: ChatMessage[][] = [];
    let messages: ChatMessage[] = [user('one'), assistant('reply one'), tool(), tool(), assistant('after tools')];
    steps.push(messages);
    // New turn: user prompt, thinking-only assistant, tools, final text.
    messages = [...messages, user('two')]; steps.push(messages);
    const thinking = assistant('', { isStreaming: true, thinking: 'hmm' });
    messages = [...messages, thinking]; steps.push(messages);
    messages = [...messages, tool('read', { state: 'running' })]; steps.push(messages);
    messages = [...messages.slice(0, -1), { ...messages[messages.length - 1], state: 'completed' } as ChatMessage]; steps.push(messages);
    messages = [...messages, titleTool(), tool('write')]; steps.push(messages);
    messages = [...messages, assistant('', { isStreaming: true })]; steps.push(messages);
    messages = [...messages.slice(0, -1), assistant('final', { isStreaming: false })]; steps.push(messages);

    let snapshot: GroupedChatSnapshot | null = null;
    for (const step of steps) {
      snapshot = groupMessagesIncremental(snapshot, step);
      expectMatchesFullGrouping(snapshot);
    }
  });

  it('reuses settled items by reference and rebuilds only the tail', () => {
    const first = groupMessagesIncremental(null, [user('one'), tool(), tool(), assistant('a'), user('two'), tool()]);
    const streaming = assistant('', { isStreaming: true, thinking: 'x' });
    const second = groupMessagesIncremental(first, [...first.messages, streaming]);

    expectMatchesFullGrouping(second);
    // Items before the open tool group are unchanged objects.
    expect(second.items[0]).toBe(first.items[0]);
    expect(second.items[1]).toBe(first.items[1]);
    expect(second.items[2]).toBe(first.items[2]);
    expect(second.items[3]).toBe(first.items[3]);
    // The tool group that was last is rebuilt because a later message now closes it.
    expect(second.items[4]).not.toBe(first.items[4]);
  });

  it('regroups from the start when older turns are prepended', () => {
    const tail = [user('two'), assistant('b')];
    const first = groupMessagesIncremental(null, tail);
    const second = groupMessagesIncremental(first, [user('one'), tool(), assistant('a'), ...tail]);

    expectMatchesFullGrouping(second);
    expect(previousUserTextAt(second, second.items.length - 1)).toBe('two');
  });

  it('drops the trailing thinking-only row once it is no longer the last message', () => {
    const thinking = assistant('', { isStreaming: true, thinking: 'hmm' });
    const first = groupMessagesIncremental(null, [user('one'), thinking]);
    expect(first.items).toHaveLength(2);

    const second = groupMessagesIncremental(first, [...first.messages, tool()]);
    expectMatchesFullGrouping(second);
    expect(second.items.map((item) => item.kind)).toEqual(['message', 'tool-group']);
  });

  it('returns the same snapshot for the same array and handles a full replacement', () => {
    const first = groupMessagesIncremental(null, [user('one'), assistant('a')]);
    expect(groupMessagesIncremental(first, first.messages)).toBe(first);

    const replaced = groupMessagesIncremental(first, [user('x'), tool(), tool(), assistant('y')]);
    expectMatchesFullGrouping(replaced);
  });
});

describe('memory changes', () => {
  it('draws a finished memory change outside the tool group, and keeps a refused one in it', () => {
    const help = tool('sero-cli');
    const saved = tool('sero-cli', { details: { exitCode: 0, memoryChange: { action: 'save', id: 'mem-1', fact: 'Use pnpm.' } } });
    const refused = tool('sero-cli', { isError: true, state: 'error', details: { memoryChange: { action: 'save', id: 'mem-2', fact: 'x' } } });
    const edit = tool('edit');

    expect(groupMessages([user(), help, saved, edit, refused]).map((item) => (
      item.kind === 'tool-group' ? item.tools.map((t) => t.id) : item.message.id
    ))).toEqual([expect.any(String), [help.id], saved.id, [edit.id, refused.id]]);
  });

  it('shows a save that memory refused as a failed row of its own', () => {
    const help = tool('sero-cli');
    const refused = tool('sero-cli', { details: { exitCode: 0, memoryRefused: true } });

    const [, helpGroup, refusedGroup] = groupMessages([user(), help, refused]);

    expect(helpGroup.kind === 'tool-group' && helpGroup.tools.map((t) => t.id)).toEqual([help.id]);
    expect(refusedGroup.kind === 'tool-group' && refusedGroup.tools.map((t) => t.state)).toEqual(['error']);
  });
});
