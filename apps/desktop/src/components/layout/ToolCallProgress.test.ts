import { describe, expect, it } from 'vitest';
import type { ChatToolCallMessage } from '@/types/ipc';
import { buildToolProgressModel, getEffectiveToolName, getToolProgressHeaderText } from './ToolCallProgress';

function makeTool(overrides: Partial<ChatToolCallMessage>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'web_search',
    input: {},
    output: null,
    isError: false,
    state: 'running',
    details: null,
    isPartialOutput: true,
    ...overrides,
  };
}

describe('buildToolProgressModel', () => {
  it('builds a structured progress model for web_search updates', () => {
    const model = buildToolProgressModel(makeTool({
      toolName: 'web_search',
      output: 'Searching 2/4: "latest Sero plugin docs"...',
      details: {
        phase: 'search',
        progress: 0.25,
        currentQuery: 'latest Sero plugin docs',
      },
    }));

    expect(model).not.toBeNull();
    expect(model?.title).toBe('Searching the web');
    expect(model?.subtitle).toBe('latest Sero plugin docs');
    expect(model?.badges).toContain('Query 2 of 4');
    expect(model?.progressPct).toBeGreaterThan(30);
  });

  it('builds an indeterminate progress model for fetch_content updates', () => {
    const model = buildToolProgressModel(makeTool({
      toolName: 'fetch_content',
      input: { urls: ['https://example.com/a', 'https://example.com/b'] },
      output: 'Downloading page content... 12s elapsed.',
      details: {
        phase: 'Downloading page content...',
        progress: 0,
        elapsedSec: 12,
      },
    }));

    expect(model).not.toBeNull();
    expect(model?.title).toBe('Downloading page content...');
    expect(model?.subtitle).toBe('2 URLs in progress');
    expect(model?.indeterminate).toBe(true);
    expect(model?.badges).toContain('12s elapsed');
  });

  it('detects bridged sero-cli web_search progress updates', () => {
    const tool = makeTool({
      toolName: 'sero-cli',
      input: {
        command: 'web_search --query "best tourist places to visit Valencia Spain"',
      },
      output: 'Searching 1/1: "best tourist places to visit Valencia Spain"...',
      details: {
        phase: 'search',
        progress: 0,
        currentQuery: 'best tourist places to visit Valencia Spain',
        commandIndex: 1,
        commandCount: 2,
      },
    });
    const model = buildToolProgressModel(tool);

    expect(model).not.toBeNull();
    expect(model?.title).toBe('Searching the web');
    expect(model?.subtitle).toBe('best tourist places to visit Valencia Spain');
    expect(model?.badges).toContain('Query 1 of 2');
    expect(getToolProgressHeaderText(tool)).toBe('Searching query 1 of 2…');
  });

  it('uses the bridged subcommand name instead of raw sero-cli', () => {
    const tool = makeTool({
      toolName: 'sero-cli',
      input: {
        command: 'sero memory replace --target memory --entry_id "mem-1" --content "updated"',
      },
      state: 'completed',
      isPartialOutput: false,
      output: 'Replaced entry mem-1 in MEMORY.md',
    });

    expect(getEffectiveToolName(tool)).toBe('memory');
  });

  it('returns null for completed tool results', () => {
    const model = buildToolProgressModel(makeTool({
      state: 'completed',
      isPartialOutput: false,
      output: 'Done',
    }));

    expect(model).toBeNull();
  });
});
