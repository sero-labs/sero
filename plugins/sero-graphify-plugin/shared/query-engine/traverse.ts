import type { GraphEdge, GraphNode, KnowledgeGraph } from './graph-loader';

export interface NeighborhoodHit {
  node: GraphNode;
  depth: number;
  /** Edge that first reached this node (undefined for seeds). */
  via?: GraphEdge;
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'how', 'what', 'does', 'with', 'this', 'that', 'where', 'why', 'who', 'are', 'can']);

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export function findSeeds(graph: KnowledgeGraph, query: string, limit = 5): GraphNode[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const scored: Array<{ node: GraphNode; score: number }> = [];
  for (const node of graph.nodes.values()) {
    const idLower = node.id.toLowerCase();
    const haystack = `${idLower} ${String(node.label ?? '').toLowerCase()} ${String(node.description ?? '').toLowerCase()}`;
    let score = 0;
    for (const term of terms) {
      if (idLower === term) score += 10;
      else if (idLower.includes(term)) score += 5;
      else if (haystack.includes(term)) score += term.length >= 5 ? 3 : 1;
    }
    if (score > 0) scored.push({ node, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.node);
}

function undirectedEdges(graph: KnowledgeGraph, id: string): GraphEdge[] {
  return [...(graph.out.get(id) ?? []), ...(graph.in.get(id) ?? [])];
}

function otherEnd(edge: GraphEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}

export function bfsNeighborhood(
  graph: KnowledgeGraph,
  seeds: GraphNode[],
  maxDepth = 2,
  maxNodes = 60,
): NeighborhoodHit[] {
  const visited = new Set(seeds.map((s) => s.id));
  const hits: NeighborhoodHit[] = [];
  let frontier: Array<{ id: string; depth: number }> = seeds.map((s) => ({ id: s.id, depth: 0 }));

  while (frontier.length > 0 && hits.length < maxNodes) {
    const next: typeof frontier = [];
    for (const { id, depth } of frontier) {
      if (depth >= maxDepth) continue;
      for (const edge of undirectedEdges(graph, id)) {
        const neighborId = otherEnd(edge, id);
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const node = graph.nodes.get(neighborId);
        if (!node) continue;
        hits.push({ node, depth: depth + 1, via: edge });
        if (hits.length >= maxNodes) return hits;
        next.push({ id: neighborId, depth: depth + 1 });
      }
    }
    frontier = next;
  }
  return hits;
}

export function shortestPath(graph: KnowledgeGraph, fromId: string, toId: string): GraphEdge[] | null {
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null;
  if (fromId === toId) return [];
  const previous = new Map<string, { id: string; edge: GraphEdge }>();
  const visited = new Set([fromId]);
  let frontier = [fromId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of undirectedEdges(graph, id)) {
        const neighborId = otherEnd(edge, id);
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        previous.set(neighborId, { id, edge });
        if (neighborId === toId) {
          const pathEdges: GraphEdge[] = [];
          let cursor = toId;
          while (cursor !== fromId) {
            const step = previous.get(cursor)!;
            pathEdges.unshift(step.edge);
            cursor = step.id;
          }
          return pathEdges;
        }
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return null;
}

export interface Neighborhood {
  node: GraphNode;
  outgoing: GraphEdge[];
  incoming: GraphEdge[];
  communityPeers: string[];
}

export function neighborhoodOf(graph: KnowledgeGraph, id: string, maxPeers = 10): Neighborhood | null {
  const node = graph.nodes.get(id);
  if (!node) return null;
  const communityPeers: string[] = [];
  if (node.community !== undefined) {
    for (const other of graph.nodes.values()) {
      if (other.id !== id && other.community === node.community) {
        communityPeers.push(other.id);
        if (communityPeers.length >= maxPeers) break;
      }
    }
  }
  return {
    node,
    outgoing: graph.out.get(id) ?? [],
    incoming: graph.in.get(id) ?? [],
    communityPeers,
  };
}

/** Resolve a user-supplied concept name to a node id (exact, case-insensitive on id and label, then seed search). */
export function resolveConcept(graph: KnowledgeGraph, concept: string): GraphNode | null {
  if (graph.nodes.has(concept)) return graph.nodes.get(concept)!;
  const lower = concept.toLowerCase();
  for (const node of graph.nodes.values()) {
    if (node.id.toLowerCase() === lower || String(node.label ?? '').toLowerCase() === lower) return node;
  }
  return findSeeds(graph, concept, 1)[0] ?? null;
}
