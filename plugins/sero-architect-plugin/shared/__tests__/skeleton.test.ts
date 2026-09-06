import { describe, expect, it } from 'vitest';
import { architectEnabled } from '../kill-switch';
import { architectPathsFromHome, resolveArchitectPaths, resolveSeroHome } from '../paths';
import { normalizeIndex } from '../types';

describe('kill switch', () => {
  it('is on unless SERO_ARCHITECT is 0 or false', () => {
    expect(architectEnabled({})).toBe(true);
    expect(architectEnabled({ SERO_ARCHITECT: '1' })).toBe(true);
    expect(architectEnabled({ SERO_ARCHITECT: '0' })).toBe(false);
    expect(architectEnabled({ SERO_ARCHITECT: ' FALSE ' })).toBe(false);
  });
});

describe('paths', () => {
  it('lives under <SERO_HOME>/apps/architect with the index as the state file', () => {
    expect(resolveSeroHome({ SERO_HOME: '/profile' })).toBe('/profile');
    expect(resolveSeroHome({ PI_CODING_AGENT_DIR: '/profile/agent' })).toBe('/profile');
    const paths = resolveArchitectPaths({ SERO_HOME: '/profile' });
    expect(paths).toEqual(architectPathsFromHome('/profile/apps/architect'));
    expect(paths.indexFile).toBe('/profile/apps/architect/state.json');
    expect(paths.projectsDir).toBe('/profile/apps/architect/projects');
  });
});

describe('index normalisation', () => {
  it('drops rows it cannot trust and defaults the rest', () => {
    const index = normalizeIndex({
      projects: [
        { id: 'a', name: 'A', phase: 'build', overlay: 'decision', spentUsd: 3, capUsd: 10, needsYou: 1 },
        { id: 'b', name: 'B', phase: 'not-a-phase' },
        { id: 'c', name: 'C', phase: 'intake', overlay: 'nope', spentUsd: 'x' },
      ],
    });
    expect(index.projects.map((p) => p.id)).toEqual(['a', 'c']);
    expect(index.projects[0].overlay).toBe('decision');
    expect(index.projects[1]).toMatchObject({ overlay: null, spentUsd: 0, capUsd: null, needsYou: 0, workspaceId: null });
    expect(normalizeIndex(null).projects).toEqual([]);
  });
});
