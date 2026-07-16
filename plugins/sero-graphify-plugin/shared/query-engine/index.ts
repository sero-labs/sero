import type { KnowledgeGraph } from './graph-loader';
import { bfsNeighborhood, findSeeds, neighborhoodOf, resolveConcept, shortestPath } from './traverse';
import { displayName, edgeLine, nodeLine, withinBudget } from './format';

/** Resolve node ids to human display names for edge rendering. */
function nameResolver(graph: KnowledgeGraph): (id: string) => string {
  return (id) => displayName(graph.nodes.get(id), id);
}

export { loadGraph, MAX_GRAPH_BYTES } from './graph-loader';
export type { KnowledgeGraph, GraphNode, GraphEdge } from './graph-loader';

/** Authoritative structural counts straight from a loaded graph. */
export function graphStats(graph: KnowledgeGraph): { nodes: number; edges: number; communities: number } {
  const communities = new Set<number>();
  for (const node of graph.nodes.values()) {
    if (typeof node.community === 'number') communities.add(node.community);
  }
  return { nodes: graph.nodes.size, edges: graph.edgeCount, communities: communities.size };
}

export interface QueryOptions {
  mode?: 'bfs' | 'dfs';
  budget?: number;
}

/** A file the search touched, resolvable back to a workspace file the UI can open. */
export interface SearchFileHit {
  /** Node display name, e.g. "CHANGELOG.md" or "splitBill()". */
  label: string;
  /** Node kind (code / document / concept …). */
  type?: string;
  /** Workspace id the file belongs to (profile graphs tag this as `repo`). */
  workspaceId: string;
  /** File path within the workspace, relative to its root. */
  path: string;
}

export interface GraphSearchResult {
  /** The same text `queryGraph` returns — the agent-facing subgraph rendering. */
  text: string;
  /** Distinct, openable files surfaced by the traversal, in relevance order. */
  files: SearchFileHit[];
}

/** Run the traversal shared by `queryGraph` and `searchGraph`. */
function traverse(graph: KnowledgeGraph, question: string, options: QueryOptions) {
  const { mode = 'bfs', budget = 1200 } = options;
  const seeds = findSeeds(graph, question);
  if (seeds.length === 0) return null;

  const depth = mode === 'dfs' ? 4 : 2;
  const hits = mode === 'dfs'
    ? bfsNeighborhood(graph, seeds.slice(0, 1), depth, 25)
    : bfsNeighborhood(graph, seeds, depth, 60);

  const name = nameResolver(graph);
  const lines: string[] = [
    `Traversal: ${mode.toUpperCase()} depth=${depth} | Start: [${seeds.map((s) => displayName(s, s.id)).join(', ')}] | ${hits.length} related nodes`,
    '',
  ];
  for (const seed of seeds) lines.push(`NODE ${nodeLine(seed)}`);
  lines.push('', 'Related:');
  for (const hit of hits) {
    lines.push(`  ${'  '.repeat(hit.depth - 1)}↳ ${nodeLine(hit.node)}${hit.via ? `  [via ${edgeLine(hit.via, name)}]` : ''}`);
  }
  return { seeds, hits, text: withinBudget(lines, budget) };
}

/**
 * Answer a question with a relevant subgraph rendered as text.
 * bfs = broad context (depth 2 wide), dfs = trace (depth 4 narrow).
 * Output shape mirrors `graphify query`: traversal header, NODE lines, edges.
 */
export function queryGraph(graph: KnowledgeGraph, question: string, options: QueryOptions = {}): string {
  return traverse(graph, question, options)?.text ?? 'No matching concepts found in the graph.';
}

/**
 * Like `queryGraph`, but also returns the distinct files the traversal touched
 * so a UI can offer to open them. A file is openable only when the node carries
 * both a workspace tag (`repo`) and a `source_file` path; concept-only nodes are
 * skipped. Files are deduped by workspace + path, seeds first, in relevance order.
 */
export function searchGraph(graph: KnowledgeGraph, question: string, options: QueryOptions = {}): GraphSearchResult {
  const result = traverse(graph, question, options);
  if (!result) return { text: 'No matching concepts found in the graph.', files: [] };

  const files: SearchFileHit[] = [];
  const seen = new Set<string>();
  const nodes = [...result.seeds, ...result.hits.map((h) => h.node)];
  for (const node of nodes) {
    if (!node.repo || !node.source_file) continue;
    const key = `${node.repo}\0${node.source_file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({
      label: displayName(node, node.id),
      type: node.type ?? node.file_type,
      workspaceId: node.repo,
      path: node.source_file,
    });
  }
  return { text: result.text, files };
}

export function findPath(graph: KnowledgeGraph, from: string, to: string, budget = 800): string {
  const fromNode = resolveConcept(graph, from);
  const toNode = resolveConcept(graph, to);
  if (!fromNode || !toNode) return `Could not resolve ${!fromNode ? `"${from}"` : `"${to}"`} to a graph node.`;
  const edges = shortestPath(graph, fromNode.id, toNode.id);
  const name = nameResolver(graph);
  if (edges === null) return `No path found between ${displayName(fromNode, fromNode.id)} and ${displayName(toNode, toNode.id)}.`;
  if (edges.length === 0) return `${displayName(fromNode, fromNode.id)} and ${displayName(toNode, toNode.id)} are the same node.`;
  return withinBudget([`Shortest path (${edges.length} hops):`, ...edges.map((e) => `  ${edgeLine(e, name)}`)], budget);
}

export function explainNode(graph: KnowledgeGraph, concept: string, budget = 1000): string {
  const node = resolveConcept(graph, concept);
  if (!node) return `"${concept}" not found in the graph.`;
  const hood = neighborhoodOf(graph, node.id)!;
  const name = nameResolver(graph);
  const lines = [`Node: ${nodeLine(node)}`, ''];
  if (hood.outgoing.length > 0) lines.push('Outgoing:', ...hood.outgoing.map((e) => `  ${edgeLine(e, name)}`));
  if (hood.incoming.length > 0) lines.push('Incoming:', ...hood.incoming.map((e) => `  ${edgeLine(e, name)}`));
  if (hood.communityPeers.length > 0) lines.push(`Same community: ${hood.communityPeers.map((id) => name(id)).join(', ')}`);
  return withinBudget(lines, budget);
}
