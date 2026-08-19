import { describe, expect, it } from 'vitest';
import type { AssistantMessage, ToolCall } from '@earendil-works/pi-ai';

import { ToolInputStreams } from '@electron/ipc/agent/core/tool-input-stream';

/**
 * Builds the message shape the SDK hands the subscriber: a shallow copy whose
 * tool call blocks carry the arguments re-parsed from the partial JSON so far.
 */
function message(...blocks: Array<Partial<ToolCall>>): AssistantMessage {
  return {
    content: blocks.map((block) => ({
      type: 'toolCall',
      id: '',
      name: 'write',
      arguments: {},
      ...block,
    })),
  } as AssistantMessage;
}

function toolCall(args: Record<string, unknown>, id = 'call-1', name = 'write'): ToolCall {
  return { type: 'toolCall', id, name, arguments: args };
}

describe('ToolInputStreams', () => {
  it('emits tails that reassemble into the final argument', () => {
    const streams = new ToolInputStreams();
    const chunks = ['const a', ' = 1;\n', 'export { a };\n'];

    expect(streams.start(message({ name: 'write' }), 0)).toMatchObject({ toolName: 'write' });

    let sent = '';
    let content = '';
    for (const chunk of chunks) {
      content += chunk;
      const advanced = streams.advance(message({ arguments: { path: '/a.ts', content } }), 0);
      expect(advanced?.replace).toBe(false);
      sent += advanced?.delta ?? '';
    }

    const finished = streams.end(toolCall({ path: '/a.ts', content }), 0);
    sent += finished?.final.delta ?? '';

    expect(sent).toBe(content);
    expect(finished?.toolCallId).toBe('call-1');
  });

  it('reports the path as soon as the partial parse exposes it', () => {
    const streams = new ToolInputStreams();
    streams.start(message({}), 0);

    expect(streams.advance(message({ arguments: {} }), 0)).toBeNull();
    expect(streams.advance(message({ arguments: { path: '/src/x.ts' } }), 0)).toMatchObject({
      path: '/src/x.ts',
      delta: '',
    });
  });

  it('replaces rather than appends when a partial parse rewinds', () => {
    const streams = new ToolInputStreams();
    streams.start(message({}), 0);

    // A partial parse can expose a trailing escape as a literal, then correct it
    // once the escape completes.
    streams.advance(message({ arguments: { content: 'line' } }), 0);
    const corrected = streams.advance(message({ arguments: { content: 'lin' } }), 0);

    expect(corrected).toMatchObject({ replace: true, delta: 'lin' });
  });

  it('keeps two tool calls in one message on separate streams', () => {
    const streams = new ToolInputStreams();
    const both = message({ name: 'write' }, { name: 'write' });

    const first = streams.start(both, 0);
    const second = streams.start(both, 1);
    expect(first?.streamKey).not.toBe(second?.streamKey);

    const advanced = streams.advance(
      message({ arguments: { content: 'a' } }, { arguments: { content: 'bb' } }),
      1,
    );
    expect(advanced).toMatchObject({ streamKey: second?.streamKey, delta: 'bb' });
  });

  it('streams the newest replacement for edit, and ignores unlisted tools', () => {
    const streams = new ToolInputStreams();

    expect(streams.start(message({ name: 'bash' }), 0)).toBeNull();
    expect(streams.advance(message({ arguments: { command: 'ls' } }), 0)).toBeNull();

    expect(streams.start(message({ name: 'bash' }, { name: 'edit' }), 1)).toMatchObject({
      toolName: 'edit',
    });
    const advanced = streams.advance(
      message(
        {},
        {
          name: 'edit',
          arguments: {
            path: '/a.ts',
            edits: [{ oldText: 'a', newText: 'b' }, { oldText: 'c', newText: 'dd' }],
          },
        },
      ),
      1,
    );
    expect(advanced).toMatchObject({ delta: 'dd', path: '/a.ts' });
  });

  it('drops streams on reset so an aborted call cannot resume', () => {
    const streams = new ToolInputStreams();
    streams.start(message({}), 0);
    streams.advance(message({ arguments: { content: 'partial' } }), 0);

    streams.reset();

    expect(streams.advance(message({ arguments: { content: 'partial more' } }), 0)).toBeNull();
    expect(streams.end(toolCall({ content: 'partial more' }), 0)).toBeNull();
  });
});
