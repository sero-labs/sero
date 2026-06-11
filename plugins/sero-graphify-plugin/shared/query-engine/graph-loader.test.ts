import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadGraph } from './graph-loader';

const FIXTURE = path.join(__dirname, 'fixtures', 'small-graph.json');

describe('loadGraph', () => {
  it('indexes nodes and edges in both directions', async () => {
    const graph = await loadGraph(FIXTURE);
    expect(graph).not.toBeNull();
    expect(graph!.nodes.size).toBe(6);
    expect(graph!.edgeCount).toBe(4);
    expect(graph!.out.get('AuthService')).toHaveLength(1);
    expect(graph!.in.get('AuthService')).toHaveLength(2);
    expect(graph!.out.get('AuthService')![0]).toMatchObject({ source: 'AuthService', target: 'TokenStore', relation: 'USES' });
  });

  it('returns null for missing, oversized, or malformed files', async () => {
    expect(await loadGraph('/nonexistent/graph.json')).toBeNull();
    expect(await loadGraph(FIXTURE, 10)).toBeNull(); // 10-byte cap
  });
});
