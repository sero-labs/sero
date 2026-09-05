import { describe, expect, it } from 'vitest';
import {
  deriveGroupStatus,
  groupStatusLabel,
  mapToolState,
} from '@/lib/tool-call-state';
import type { ToolCall } from '@/stores/chat';

function tool(state: ToolCall['state'], extra: Partial<ToolCall> = {}): ToolCall {
  return { toolCallId: `id-${state}`, toolName: 'bash', state, ...extra };
}

describe('mapToolState', () => {
  it('maps every gateway state to an ai-elements state', () => {
    expect(mapToolState('streaming')).toBe('input-streaming');
    expect(mapToolState('running')).toBe('input-available');
    expect(mapToolState('done')).toBe('output-available');
    expect(mapToolState('error')).toBe('output-error');
    expect(mapToolState('cancelled')).toBe('output-denied');
  });
});

describe('deriveGroupStatus', () => {
  it('reports running while any call is still working', () => {
    expect(deriveGroupStatus([tool('done'), tool('running')])).toBe('running');
    expect(deriveGroupStatus([tool('done'), tool('streaming')])).toBe('running');
  });

  it('reports running while a finished call still streams its input', () => {
    expect(deriveGroupStatus([tool('done', { isStreamingInput: true })])).toBe('running');
  });

  it('prefers cancelled over error once nothing is running', () => {
    expect(deriveGroupStatus([tool('error'), tool('cancelled')])).toBe('cancelled');
  });

  it('reports error when a call failed and none was cancelled', () => {
    expect(deriveGroupStatus([tool('done'), tool('error')])).toBe('error');
  });

  it('reports completed when every call finished cleanly', () => {
    expect(deriveGroupStatus([tool('done'), tool('done')])).toBe('completed');
  });
});

describe('groupStatusLabel', () => {
  it('uses the singular for one action', () => {
    expect(groupStatusLabel('completed', 1)).toBe('1 action completed');
  });

  it('uses the plural for several', () => {
    expect(groupStatusLabel('running', 3)).toBe('Running 3 actions...');
    expect(groupStatusLabel('cancelled', 2)).toBe('2 actions (cancelled)');
  });
});
