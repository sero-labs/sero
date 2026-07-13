import { describe, expect, it, vi } from 'vitest';

// The catalog module reads/writes a cache file and pulls in infra/SDK at import
// for its startup enumeration. None of that is needed to exercise the in-memory
// store, so stub it all out.
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('no cache'); }),
  writeFileSync: vi.fn(),
}));
vi.mock('@electron/platform/env', () => ({ SERO_AGENT_DIR: '/agent', SERO_HOME: '/tmp/sero-test' }));
vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: vi.fn(),
  SessionManager: { inMemory: vi.fn() },
}));
vi.mock('@electron/shared/infra/ai-infra', () => ({ ensureAiInfra: vi.fn() }));
vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: {} }));
vi.mock('@electron/features/subagent/runtime/resource-loader', () => ({
  createSubagentResourceLoader: vi.fn(),
}));

import {
  STATIC_PLATFORM_TOOLS,
  getSubagentToolCatalog,
  recordRunToolCatalog,
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
      { name: 'web_search', description: 'Search the web' },
      { name: 'orchestrator', description: 'Run orchestrator loops' },
    ] as never);

    const catalog = getSubagentToolCatalog();
    const names = catalog.map((t) => t.name);
    expect(names).toContain('web_search');
    expect(names).toContain('orchestrator');
    // No name appears twice.
    expect(new Set(names).size).toBe(names.length);
  });

  it('updates the description when the same tool name is recorded again', () => {
    recordRunToolCatalog([{ name: 'web_search', description: 'v1' }] as never);
    recordRunToolCatalog([{ name: 'web_search', description: 'v2' }] as never);

    const entries = getSubagentToolCatalog().filter((t) => t.name === 'web_search');
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe('v2');
  });
});
