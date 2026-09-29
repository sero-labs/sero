import { describe, expect, it, vi } from 'vitest';

// The catalog module reads/writes a cache file and pulls in infra/SDK at import
// for its startup enumeration. None of that is needed to exercise the in-memory
// store, so stub it all out.
const fsFake = vi.hoisted(() => ({
  readFileSync: vi.fn((): string => { throw new Error('no cache'); }),
  existsSync: vi.fn((_path: string) => true),
}));
vi.mock('fs', () => ({
  readFileSync: fsFake.readFileSync,
  existsSync: fsFake.existsSync,
  writeFileSync: vi.fn(),
}));
vi.mock('@electron/features/plugins/resource-compatibility', () => ({
  packageRootForResourcePath: (resourcePath: string) => resourcePath.split('/extension/')[0] ?? null,
}));
vi.mock('@electron/features/plugins/bridge-policy', () => ({
  isToolForSessionKind: (_path: string, name: string, kind: string) => !(name === 'goal' && kind === 'member'),
}));
vi.mock('@electron/platform/env', () => ({ SERO_AGENT_DIR: '/agent', SERO_HOME: '/tmp/sero-test' }));
const probe = vi.hoisted(() => ({
  bindExtensions: vi.fn(),
  emit: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: vi.fn(async () => ({
    session: {
      bindExtensions: probe.bindExtensions,
      extensionRunner: { emit: probe.emit },
      getAllTools: () => [{
        name: 'probe_tool',
        description: 'From the probe',
        sourceInfo: { path: '/plugins/probe/extension/index.js' },
      }],
      dispose: probe.dispose,
    },
  })),
  SessionManager: { inMemory: vi.fn() },
}));
vi.mock('@electron/shared/infra/ai-infra', () => ({ ensureAiInfra: vi.fn(async () => ({})) }));
vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: {} }));
vi.mock('@electron/features/subagent/runtime/resource-loader', () => ({
  createSubagentResourceLoader: vi.fn(() => ({ reload: vi.fn(async () => undefined) })),
}));

import {
  STATIC_PLATFORM_TOOLS,
  getSubagentToolCatalog,
  getToolCatalogFor,
  getToolPackagePath,
  recordRunToolCatalog,
  warmSubagentToolCatalog,
} from '@electron/features/subagent/runtime/tool-catalog';

describe('subagent tool catalog', () => {
  it('seeds the platform baseline with the real automation_browser name', () => {
    const names = getSubagentToolCatalog().map((t) => t.name);
    for (const tool of STATIC_PLATFORM_TOOLS) expect(names).toContain(tool.name);
    // Regression: the old stub named the browser `browser`, so disabling it was a no-op.
    expect(names).toContain('automation_browser');
    expect(names).not.toContain('browser');
  });

  it('unions a real run\'s tools in by name, without duplicates', () => {
    recordRunToolCatalog([
      { name: 'web_search', description: 'Search the web', sourceInfo: { path: '/plugins/web/extension/index.js' } },
      { name: 'orchestrator', description: 'Run orchestrator loops', sourceInfo: { path: '/plugins/orch/extension/index.js' } },
    ] as never);

    const catalog = getSubagentToolCatalog();
    const names = catalog.map((t) => t.name);
    expect(names).toContain('web_search');
    expect(names).toContain('orchestrator');
    // No name appears twice.
    expect(new Set(names).size).toBe(names.length);
  });

  it('updates the description when the same tool name is recorded again', () => {
    const sourceInfo = { path: '/plugins/web/extension/index.js' };
    recordRunToolCatalog([{ name: 'web_search', description: 'v1', sourceInfo }] as never);
    recordRunToolCatalog([{ name: 'web_search', description: 'v2', sourceInfo }] as never);

    const entries = getSubagentToolCatalog().filter((t) => t.name === 'web_search');
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe('v2');
  });

  it('builds the catalog without starting the probe session\'s extensions', async () => {
    await warmSubagentToolCatalog();

    expect(getSubagentToolCatalog().map((t) => t.name)).toContain('probe_tool');
    // Pi emits session_start only from bindExtensions(); the probe never runs a turn.
    expect(probe.bindExtensions).not.toHaveBeenCalled();
    expect(probe.emit).not.toHaveBeenCalled();
    expect(probe.dispose).toHaveBeenCalledOnce();
  });

  it('names the package that registers each plugin tool', () => {
    recordRunToolCatalog([
      { name: 'web_search', description: 'Search the web', sourceInfo: { path: '/plugins/web/extension/index.js' } },
    ] as never);

    expect(getToolPackagePath('web_search')).toBe('/plugins/web');
    expect(getToolPackagePath('bash')).toBeUndefined();
  });

  it('leaves a tool out of the catalogue for a session kind its plugin excludes', () => {
    recordRunToolCatalog([
      { name: 'goal', description: 'Goals', sourceInfo: { path: '/plugins/orch/extension/index.js' } },
    ] as never);

    expect(getToolCatalogFor('chat').map((tool) => tool.name)).toContain('goal');
    expect(getToolCatalogFor('member').map((tool) => tool.name)).not.toContain('goal');
  });

  describe('the saved cache', () => {
    async function loadCatalogWith(cache: unknown) {
      vi.resetModules();
      fsFake.readFileSync.mockImplementation(() => JSON.stringify(cache));
      const mod = await import('@electron/features/subagent/runtime/tool-catalog');
      fsFake.readFileSync.mockImplementation(() => { throw new Error('no cache'); });
      return mod.getToolCatalogFor('subagent').map((tool) => tool.name);
    }

    it('drops a plugin tool whose package is gone', async () => {
      fsFake.existsSync.mockImplementation((file) => !file.startsWith('/plugins/removed/'));
      const names = await loadCatalogWith({
        version: 2,
        tools: [
          { name: 'kept_tool', description: 'Kept', packagePath: '/plugins/kept' },
          { name: 'removed_tool', description: 'Gone', packagePath: '/plugins/removed' },
        ],
      });
      expect(names).toContain('kept_tool');
      expect(names).not.toContain('removed_tool');
    });

    it('offers a member only the plugin tools a real session reported in this process', async () => {
      fsFake.existsSync.mockImplementation(() => true);
      vi.resetModules();
      fsFake.readFileSync.mockImplementation(() => JSON.stringify({
        version: 2,
        tools: [{ name: 'renamed_away', description: 'Old name', packagePath: '/plugins/kept' }],
      }));
      const mod = await import('@electron/features/subagent/runtime/tool-catalog');
      fsFake.readFileSync.mockImplementation(() => { throw new Error('no cache'); });
      mod.recordRunToolCatalog([
        { name: 'new_name', description: 'Current', sourceInfo: { path: '/plugins/kept/extension/index.js' } },
      ] as never);

      const member = mod.getToolCatalogFor('member').map((tool) => tool.name);
      expect(member).toContain('new_name');
      expect(member).not.toContain('renamed_away');
    });

    it('ignores a cache that does not say which package each tool came from', async () => {
      const names = await loadCatalogWith({ tools: [{ name: 'legacy_tool', description: 'Old' }] });
      expect(names).not.toContain('legacy_tool');
    });
  });
});
