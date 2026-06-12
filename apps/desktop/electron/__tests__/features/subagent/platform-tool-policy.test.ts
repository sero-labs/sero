import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { filterPlatformTools, sessionToolOptions } from '@electron/features/subagent/runtime/runner';

function tool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ content: [] }),
  } as unknown as ToolDefinition;
}

const PLATFORM = ['bash', 'read', 'write', 'edit', 'sero-cli'].map(tool);

describe('filterPlatformTools', () => {
  it("returns all tools for 'all'", () => {
    expect(filterPlatformTools(PLATFORM, 'all')).toHaveLength(5);
  });

  it("returns only the read tool for 'readOnly'", () => {
    expect(filterPlatformTools(PLATFORM, 'readOnly').map((t) => t.name)).toEqual(['read']);
  });

  it("returns no tools for 'none'", () => {
    expect(filterPlatformTools(PLATFORM, 'none')).toEqual([]);
  });
});

describe('sessionToolOptions', () => {
  it("disables only builtins for 'all' (no allowlist — current behaviour)", () => {
    expect(sessionToolOptions('all', PLATFORM)).toEqual({ noTools: 'builtin' });
  });

  it("allowlists exactly the session tools for 'none' (excludes extension tools)", () => {
    const custom = [tool('factory_read_file'), tool('factory_submit_artefact')];
    expect(sessionToolOptions('none', custom)).toEqual({
      noTools: 'builtin',
      tools: ['factory_read_file', 'factory_submit_artefact'],
    });
  });

  it("allowlists read plus custom tools for 'readOnly'", () => {
    const combined = [tool('read'), tool('factory_submit_artefact')];
    expect(sessionToolOptions('readOnly', combined)).toEqual({
      noTools: 'builtin',
      tools: ['read', 'factory_submit_artefact'],
    });
  });
});
