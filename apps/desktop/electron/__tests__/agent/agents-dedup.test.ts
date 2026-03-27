import { describe, it, expect } from 'vitest';

/**
 * Mirrors the agentsFilesOverride callback in agent.ts.
 * Extracted here so the dedup logic is testable in isolation.
 */
function buildAgentsFilesOverride(
  globalAgentsFile: { path: string; content: string },
  discovered: { agentsFiles: Array<{ path: string; content: string }> },
): { agentsFiles: Array<{ path: string; content: string }> } {
  return {
    agentsFiles: [
      globalAgentsFile,
      ...discovered.agentsFiles.filter((f) => f.path !== globalAgentsFile.path),
    ],
  };
}

describe('agentsFilesOverride dedup', () => {
  const globalFile = {
    path: '/Users/test/.sero-ui/workspaces/global/AGENTS.md',
    content: '# Global workspace agents',
  };

  it('deduplicates when SDK discovers the same file as the global workspace', () => {
    // SDK walks up from cwd and finds the same AGENTS.md
    const discovered = {
      agentsFiles: [
        { path: '/Users/test/.sero-ui/workspaces/global/AGENTS.md', content: '# Global workspace agents' },
      ],
    };

    const result = buildAgentsFilesOverride(globalFile, discovered);

    expect(result.agentsFiles).toHaveLength(1);
    expect(result.agentsFiles[0].path).toBe(globalFile.path);
  });

  it('keeps both when workspace has a different AGENTS.md', () => {
    // Non-global workspace with its own AGENTS.md
    const discovered = {
      agentsFiles: [
        { path: '/Users/test/projects/my-app/AGENTS.md', content: '# My App' },
      ],
    };

    const result = buildAgentsFilesOverride(globalFile, discovered);

    expect(result.agentsFiles).toHaveLength(2);
    expect(result.agentsFiles[0].path).toBe(globalFile.path);
    expect(result.agentsFiles[1].path).toBe('/Users/test/projects/my-app/AGENTS.md');
  });

  it('preserves order: global first, then workspace-specific', () => {
    const discovered = {
      agentsFiles: [
        { path: '/Users/test/projects/AGENTS.md', content: '# Parent' },
        { path: '/Users/test/projects/my-app/AGENTS.md', content: '# Child' },
      ],
    };

    const result = buildAgentsFilesOverride(globalFile, discovered);

    expect(result.agentsFiles).toHaveLength(3);
    expect(result.agentsFiles.map((f) => f.path)).toEqual([
      globalFile.path,
      '/Users/test/projects/AGENTS.md',
      '/Users/test/projects/my-app/AGENTS.md',
    ]);
  });

  it('handles empty discovered list', () => {
    const result = buildAgentsFilesOverride(globalFile, { agentsFiles: [] });

    expect(result.agentsFiles).toHaveLength(1);
    expect(result.agentsFiles[0]).toBe(globalFile);
  });
});
