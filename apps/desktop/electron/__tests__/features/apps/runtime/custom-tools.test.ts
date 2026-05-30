import { describe, expect, it } from 'vitest';
import { Type } from 'typebox';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { validateRuntimeCustomTools } from '@electron/features/apps/runtime/capabilities/custom-tools';

describe('validateRuntimeCustomTools', () => {
  it('accepts valid tool definitions', () => {
    const tools: ToolDefinition[] = [{
      name: 'demo',
      label: 'Demo',
      description: 'Demo tool',
      parameters: Type.Object({ action: Type.String() }),
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: undefined }),
    }];

    expect(validateRuntimeCustomTools(tools)).toStrictEqual(tools);
  });

  it('rejects invalid tool definitions before they reach Pi', () => {
    expect(() => validateRuntimeCustomTools([
      {
        name: 'broken-tool',
        description: 'Missing execute and parameters',
      },
    ])).toThrow(/Invalid app runtime customTools\[0\]/);
  });
});
