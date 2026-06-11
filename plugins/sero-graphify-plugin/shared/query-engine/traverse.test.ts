import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { loadGraph, type KnowledgeGraph } from './graph-loader';
import { findSeeds, bfsNeighborhood, shortestPath, neighborhoodOf } from './traverse';

let graph: KnowledgeGraph;
beforeAll(async () => {
  graph = (await loadGraph(path.join(__dirname, 'fixtures', 'small-graph.json')))!;
});

describe('findSeeds', () => {
  it('ranks exact id matches first', () => {
    const seeds = findSeeds(graph, 'how does AuthService work');
    expect(seeds[0].id).toBe('AuthService');
  });
  it('matches on descriptions', () => {
    const seeds = findSeeds(graph, 'subscription billing invoices');
    expect(seeds.map((s) => s.id)).toContain('BillingService');
  });
  it('matches on labels', () => {
    const seeds = findSeeds(graph, 'token store internals');
    expect(seeds.map((s) => s.id)).toContain('TokenStore');
  });
  it('returns empty for no matches', () => {
    expect(findSeeds(graph, 'zzz qqq')).toEqual([]);
  });
});

describe('bfsNeighborhood', () => {
  it('collects nodes by depth with the connecting edge', () => {
    const hits = bfsNeighborhood(graph, [graph.nodes.get('LoginHandler')!], 2, 10);
    const ids = hits.map((h) => h.node.id);
    expect(ids).toContain('AuthService'); // depth 1
    expect(ids).toContain('TokenStore'); // depth 2
    expect(ids).not.toContain('Orphan');
  });
  it('respects maxNodes', () => {
    expect(bfsNeighborhood(graph, [graph.nodes.get('LoginHandler')!], 3, 2)).toHaveLength(2);
  });
});

describe('shortestPath', () => {
  it('finds a path across directions', () => {
    const edges = shortestPath(graph, 'InvoiceJob', 'TokenStore');
    expect(edges).not.toBeNull();
    expect(edges!.length).toBe(3); // InvoiceJob→BillingService→AuthService→TokenStore
  });
  it('returns null when disconnected', () => {
    expect(shortestPath(graph, 'Orphan', 'AuthService')).toBeNull();
  });
});

describe('neighborhoodOf', () => {
  it('groups incoming/outgoing edges and community peers', () => {
    const hood = neighborhoodOf(graph, 'AuthService')!;
    expect(hood.outgoing).toHaveLength(1);
    expect(hood.incoming).toHaveLength(2);
    expect(hood.communityPeers).toContain('TokenStore');
  });
});
