// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { ChatToolCallMessage } from '@/types/ipc';
import { StreamingFileWrite } from './StreamingFileWrite';
import { buildStreamingFilePreview } from './streaming-file-preview';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function tool(overrides: Partial<ChatToolCallMessage>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'msg-1',
    toolCallId: 'call-1',
    toolName: 'edit',
    input: {},
    output: null,
    details: null,
    isError: false,
    state: 'pending',
    isStreamingInput: true,
    ...overrides,
  };
}

describe('buildStreamingFilePreview', () => {
  it('reads content for a write and keeps the trailing-newline count rule', () => {
    const preview = buildStreamingFilePreview(tool({
      toolName: 'write',
      input: { path: 'a.ts', content: 'one\ntwo\n' },
    }));
    expect(preview.previewText).toBe('one\ntwo\n');
    expect(preview.lineCount).toBe(2);
    expect(preview.isFragment).toBe(false);
  });

  it('reads top-level newText for a single edit', () => {
    const preview = buildStreamingFilePreview(tool({
      input: { path: 'a.ts', oldText: 'a', newText: 'one\ntwo' },
    }));
    expect(preview.previewText).toBe('one\ntwo');
    expect(preview.lineCount).toBe(2);
    expect(preview.isFragment).toBe(true);
  });

  it('reads array entries in order and ignores top-level newText', () => {
    const preview = buildStreamingFilePreview(tool({
      input: {
        path: 'a.ts',
        edits: [{ oldText: 'a', newText: 'first' }, { oldText: 'b', newText: 'second' }],
        newText: 'should-not-appear',
      },
    }));
    expect(preview.previewText).toBe('first\n──────\nsecond');
    expect(preview.previewText).not.toContain('should-not-appear');
    expect(preview.lineCount).toBe(2);
  });

  it('tolerates incomplete entries and counts empty strings as zero lines', () => {
    const preview = buildStreamingFilePreview(tool({
      input: {
        path: 'a.ts',
        edits: [
          { oldText: 'a', newText: 'first\nline' },
          { oldText: 'b' },
          { oldText: 'c', newText: '' },
          { oldText: 'd', newText: 'third' },
        ],
      },
    }));
    expect(preview.previewText).toBe('first\nline\n──────\nthird');
    expect(preview.lineCount).toBe(3);
  });

  it('does not fall back to top-level fields while an array is incomplete', () => {
    const preview = buildStreamingFilePreview(tool({
      input: { path: 'a.ts', edits: [{ oldText: 'a' }], newText: 'fallback' },
    }));
    expect(preview.previewText).toBe('');
    expect(preview.lineCount).toBe(0);
  });

  it('applies the tail budget across all entries and excludes separators from the count', () => {
    const entries = Array.from({ length: 150 }, (_, index) => ({
      oldText: `old-${index}`,
      newText: `new-${index}`,
    }));
    const preview = buildStreamingFilePreview(tool({ input: { path: 'a.ts', edits: entries } }));
    expect(preview.lineCount).toBe(150);
  });
});

describe('StreamingFileWrite rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders array entries in order with separators and the total count', async () => {
    await act(async () => root.render(<StreamingFileWrite tool={tool({
      input: {
        path: 'a.ts',
        edits: [
          { oldText: 'a', newText: 'first replacement' },
          { oldText: 'b', newText: 'second replacement' },
        ],
      },
    })} />));

    const text = container.querySelector('pre')?.textContent ?? '';
    expect(text.indexOf('first replacement')).toBeLessThan(text.indexOf('second replacement'));
    expect(text).toContain('──────');
    expect(container.textContent).toContain('replacement · 2 lines');
  });

  it('renders an available entry without an error while another entry streams', async () => {
    await act(async () => root.render(<StreamingFileWrite tool={tool({
      input: { path: 'a.ts', edits: [{ oldText: 'a', newText: 'first' }, { oldText: 'b' }] },
    })} />));

    expect(container.querySelector('pre')?.textContent).toContain('first');
    expect(container.textContent).toContain('replacement · 1 line');
  });

  it('applies one tail budget across every array entry', async () => {
    const entries = Array.from({ length: 150 }, (_, index) => ({
      oldText: `old-${index}`,
      newText: `line-${index}\nline-${index}-b`,
    }));
    await act(async () => root.render(<StreamingFileWrite tool={tool({
      input: { path: 'a.ts', edits: entries },
    })} />));

    const text = container.querySelector('pre')?.textContent ?? '';
    expect(text).toContain('line-149-b');
    expect(text).not.toContain('line-0\n');
    // 150 entries x 2 lines = 300 replacement lines, below the 200-line tail.
    expect(text.split('\n').length).toBeLessThanOrEqual(200);
  });
});
