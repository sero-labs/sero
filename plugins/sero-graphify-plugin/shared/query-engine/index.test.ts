import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { loadGraph, queryGraph, findPath, explainNode, type KnowledgeGraph } from './index';

let graph: KnowledgeGraph;
beforeAll(async () => {
  graph = (await loadGraph(path.join(__dirname, 'fixtures', 'small-graph.json')))!;
});

describe('queryGraph', () => {
  it('returns seeds and related nodes', () => {
    const answer = queryGraph(graph, 'authentication sessions');
    expect(answer).toContain('AuthService');
    expect(answer).toContain('TokenStore');
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

describe('explainNode', () => {
  it('renders neighborhood', () => {
    const answer = explainNode(graph, 'authservice');
    expect(answer).toContain('Outgoing:');
    expect(answer).toContain('Incoming:');
  });
});
