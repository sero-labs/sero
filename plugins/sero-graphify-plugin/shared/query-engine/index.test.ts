import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { loadGraph, queryGraph, findPath, explainNode, graphStats, type KnowledgeGraph } from './index';

let graph: KnowledgeGraph;
beforeAll(async () => {
  graph = (await loadGraph(path.join(__dirname, 'fixtures', 'small-graph.json')))!;
});

describe('queryGraph', () => {
  it('returns seeds and related nodes rendered with human labels', () => {
    const answer = queryGraph(graph, 'authentication sessions');
    expect(answer).toContain('Auth Service');
    expect(answer).toContain('Token Store');
    // Raw slug ids never leak into the rendered output.
    expect(answer).not.toContain('AuthService');
  });
  it('renders a traversal header like graphify query', () => {
    const answer = queryGraph(graph, 'authentication sessions');
    expect(answer).toMatch(/^Traversal: BFS depth=2 \| Start: \[.*\] \| \d+ related nodes/);
  });
  it('truncates to budget', () => {
    const answer = queryGraph(graph, 'authentication sessions', { budget: 30 });
    expect(answer).toContain('truncated');
    expect(answer.length).toBeLessThan(600);
  });
  it('handles no matches', () => {
    expect(queryGraph(graph, 'zzzz')).toContain('No matching concepts');
  });
});

describe('findPath', () => {
  it('renders hop chain', () => {
    expect(findPath(graph, 'InvoiceJob', 'TokenStore')).toContain('3 hops');
  });
  it('resolves concepts by label', () => {
    expect(findPath(graph, 'Invoice Job', 'Token Store')).toContain('3 hops');
  });
});

describe('graphStats', () => {
  it('counts nodes, edges, and distinct communities from the graph itself', () => {
    expect(graphStats(graph)).toEqual({ nodes: 6, edges: 4, communities: 3 });
  });
});

describe('explainNode', () => {
  it('renders neighborhood with human labels', () => {
    const answer = explainNode(graph, 'authservice');
    expect(answer).toContain('Outgoing:');
    expect(answer).toContain('Incoming:');
    expect(answer).toContain('Token Store');
  });
});
