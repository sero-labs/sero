import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { graphifyPathsFromHome, resolveGraphifyPaths, resolveSeroHome, workspaceGraphDir, workspaceGraphJson, workspaceGraphReport } from './paths';

describe('paths', () => {
  it('resolves SERO_HOME from env in priority order', () => {
    expect(resolveSeroHome({ SERO_HOME: '/profile' })).toBe('/profile');
    expect(resolveSeroHome({ PI_CODING_AGENT_DIR: '/profile/agent' })).toBe('/profile');
    expect(resolveSeroHome({})).toBe(path.join(process.env.HOME ?? '', '.pi'));
  });

  it('derives all graphify paths from home', () => {
    const p = graphifyPathsFromHome('/profile/apps/graphify');
    expect(p.stateFile).toBe('/profile/apps/graphify/state.json');
    expect(p.graphsDir).toBe('/profile/apps/graphify/graphs');
    expect(p.toolsDir).toBe('/profile/apps/graphify/tools');
    expect(p.profileGraph).toBe('/profile/apps/graphify/profile/graph.json');
  });

  it('derives per-workspace artifact paths', () => {
    const p = resolveGraphifyPaths({ SERO_HOME: '/profile' });
    expect(workspaceGraphDir(p, 'my-ws')).toBe('/profile/apps/graphify/graphs/my-ws');
    expect(workspaceGraphJson(p, 'my-ws')).toBe('/profile/apps/graphify/graphs/my-ws/graphify-out/graph.json');
    expect(workspaceGraphReport(p, 'my-ws')).toBe('/profile/apps/graphify/graphs/my-ws/graphify-out/GRAPH_REPORT.md');
  });
});
