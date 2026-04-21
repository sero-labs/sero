import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import mcpExtension from '../index';

describe('mcp extension tool registration order', () => {
  it('registers the preferred mcp tool before the manager tool', () => {
    const registerTool = vi.fn();
    const on = vi.fn();
    const pi = {
      registerTool,
      on,
    } as unknown as ExtensionAPI;

    mcpExtension(pi);

    expect(registerTool.mock.calls[0]?.[0]?.name).toBe('mcp');
    expect(registerTool.mock.calls[1]?.[0]?.name).toBe('mcp_manager');
  });
});
