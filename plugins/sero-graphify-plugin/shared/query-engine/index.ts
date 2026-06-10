import type { KnowledgeGraph } from './graph-loader';
import { bfsNeighborhood, findSeeds, neighborhoodOf, resolveConcept, shortestPath } from './traverse';
import { edgeLine, nodeLine, withinBudget } from './format';

export { loadGraph, MAX_GRAPH_BYTES } from './graph-loader';
export type { KnowledgeGraph, GraphNode, GraphEdge } from './graph-loader';

export interface QueryOptions {
  mode?: 'bfs' | 'dfs';
  budget?: number;
}

/**
 * Answer a question with a relevant subgraph rendered as text.
 * bfs = broad context (depth 2 wide), dfs = trace (depth 4 narrow).
 * Output shape mirrors `graphify query`: traversal header, NODE lines, edges.
 */
export function queryGraph(graph: KnowledgeGraph, question: string, options: QueryOptions = {}): string {
  const { mode = 'bfs', budget = 1200 } = options;
  const seeds = findSeeds(graph, question);
  if (seeds.length === 0) return 'No matching concepts found in the graph.';

  const depth = mode === 'dfs' ? 4 : 2;
  const hits = mode === 'dfs'
    ? bfsNeighborhood(graph, seeds.slice(0, 1), depth, 25)
    : bfsNeighborhood(graph, seeds, depth, 60);

  const lines: string[] = [
    `Traversal: ${mode.toUpperCase()} depth=${depth} | Start: [${seeds.map((s) => s.id).join(', ')}] | ${hits.length} related nodes`,
    '',
  ];
  for (const seed of seeds) lines.push(`NODE ${nodeLine(seed)}`);
  lines.push('', 'Related:');
  for (const hit of hits) {
    lines.push(`  ${'  '.repeat(hit.depth - 1)}↳ ${nodeLine(hit.node)}${hit.via ? `  [via ${edgeLine(hit.via)}]` : ''}`);
  }
  return withinBudget(lines, budget);
}

export function findPath(graph: KnowledgeGraph, from: string, to: string, budget = 800): string {
  const fromNode = resolveConcept(graph, from);
  const toNode = resolveConcept(graph, to);
  if (!fromNode || !toNode) return `Could not resolve ${!fromNode ? `"${from}"` : `"${to}"`} to a graph node.`;
  const edges = shortestPath(graph, fromNode.id, toNode.id);
  if (edges === null) return `No path found between ${fromNode.id} and ${toNode.id}.`;
  if (edges.length === 0) return `${fromNode.id} and ${toNode.id} are the same node.`;
  return withinBudget([`Shortest path (${edges.length} hops):`, ...edges.map((e) => `  ${edgeLine(e)}`)], budget);
}

export function explainNode(graph: KnowledgeGraph, concept: string, budget = 1000): string {
  const node = resolveConcept(graph, concept);
  if (!node) return `"${concept}" not found in the graph.`;
  const hood = neighborhoodOf(graph, node.id)!;
  const lines = [`Node: ${nodeLine(node)}`, ''];
  if (hood.outgoing.length > 0) lines.push('Outgoing:', ...hood.outgoing.map((e) => `  ${edgeLine(e)}`));
  if (hood.incoming.length > 0) lines.push('Incoming:', ...hood.incoming.map((e) => `  ${edgeLine(e)}`));
  if (hood.communityPeers.length > 0) lines.push(`Same community: ${hood.communityPeers.join(', ')}`);
  return withinBudget(lines, budget);
}
