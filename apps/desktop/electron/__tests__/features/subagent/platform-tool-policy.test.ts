import { describe, expect, it } from 'vitest';
import type { LoadExtensionsResult, ToolDefinition } from '@earendil-works/pi-coding-agent';

import { filterPlatformTools, planWorkerTools, sessionToolOptions } from '@electron/features/subagent/runtime/session-policy';

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

  it("allowlists read, custom tools, and the read-only search tools for 'readOnly'", () => {
    const combined = [tool('read'), tool('factory_submit_artefact')];
    expect(sessionToolOptions('readOnly', combined)).toEqual({
      noTools: 'builtin',
      tools: ['read', 'factory_submit_artefact', 'find', 'grep', 'multi_grep'],
    });
  });

  it("does not add search tools for 'none'", () => {
    expect(sessionToolOptions('none', [tool('factory_read_file')]).tools)
      .toEqual(['factory_read_file']);
  });

  it('never lists a search tool twice', () => {
    const combined = [tool('read'), tool('grep')];
    expect(sessionToolOptions('readOnly', combined).tools)
      .toEqual(['read', 'grep', 'find', 'multi_grep']);
  });

  it('leaves an explicit per-step allowlist untouched', () => {
    expect(sessionToolOptions('readOnly', [tool('read')], ['read']))
      .toEqual({ noTools: 'builtin', tools: ['read'] });
  });
});

describe('planWorkerTools', () => {
  /** The plugin tools the loaded extensions provide, as Pi hands them over. */
  function extensions(...names: string[]): LoadExtensionsResult {
    const tools = new Map(names.map((name) => [name, { definition: tool(name), sourceInfo: {} }]));
    return { extensions: [{ resolvedPath: '/plugin/extension.ts', tools, commands: new Map() }], errors: [], runtime: {} } as never;
  }
  const loaded = extensions('web_search', 'codemode');
  const base = {
    policy: 'all' as const,
    customTools: PLATFORM,
    disabledTools: new Set<string>(),
    extensions: () => loaded,
  };

  it('lets a worker with a planner loadout reach another tool the policy allows', () => {
    const plan = planWorkerTools({ ...base, allowlist: ['read', 'sero-cli'], allowlistIsLoadout: true });

    expect(plan.options.tools).toEqual(expect.arrayContaining(['read', 'bash', 'web_search', 'codemode', 'tool_search']));
    // Registered, but only the planner's picks are declared when the session opens.
    expect(plan.initialTools).toEqual(['read', 'sero-cli', 'tool_search']);
    const exposure = Object.fromEntries(plan.customTools.map((entry) => [entry.name, entry.exposure]));
    expect(exposure).toMatchObject({ read: undefined, bash: 'deferred' });
    expect(loaded.extensions[0].tools.get('web_search')?.definition.exposure).toBe('deferred');
    expect(plan.activateCodemode).toBe(false);
  });

  it('keeps an explicit user allowlist as a hard bound', () => {
    const plan = planWorkerTools({ ...base, allowlist: ['read'], allowlistIsLoadout: false });

    expect(plan.options.tools).toEqual(['read']);
    expect(plan.options.tools).not.toContain('tool_search');
    expect(plan.initialTools).toBeUndefined();
    expect(plan.customTools).toBe(PLATFORM);
  });

  it('never registers a tool the user disabled, nor Code Mode when it is disabled', () => {
    const plan = planWorkerTools({
      ...base,
      allowlist: ['read'],
      allowlistIsLoadout: true,
      disabledTools: new Set(['web_search', 'codemode']),
    });

    expect(plan.options.tools).not.toContain('web_search');
    expect(plan.options.tools).not.toContain('codemode');
    expect(plan.options.tools).toContain('bash');
  });

  it('keeps a read-only worker read-only even with a loadout', () => {
    const plan = planWorkerTools({
      ...base,
      policy: 'readOnly',
      customTools: [tool('read')],
      allowlist: ['read'],
      allowlistIsLoadout: true,
    });

    expect(plan.options.tools).not.toContain('web_search');
    expect(plan.options.tools).not.toContain('bash');
    expect(plan.options.tools).toEqual(expect.arrayContaining(['read', 'find', 'grep']));
  });

  it('switches Code Mode on when the loadout names it', () => {
    const plan = planWorkerTools({ ...base, allowlist: ['read', 'codemode'], allowlistIsLoadout: true });

    expect(plan.activateCodemode).toBe(true);
    expect(plan.initialTools).toContain('codemode');
  });

  it('adds no tool_search when nothing is left to find', () => {
    const plan = planWorkerTools({
      ...base,
      customTools: [tool('read')],
      extensions: () => extensions(),
      disabledTools: new Set(['codemode']),
      allowlist: ['read'],
      allowlistIsLoadout: true,
    });

    expect(plan.options.tools).not.toContain('tool_search');
    expect(plan.initialTools).toBeUndefined();
  });
});
