import { readFile, stat } from 'node:fs/promises';

export interface GraphNode {
  id: string;
  label?: string;
  description?: string;
  community?: number;
  file_type?: string;
  type?: string;
  /** Workspace tag on merged profile graphs. */
  repo?: string;
  source_file?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  out: Map<string, GraphEdge[]>;
  in: Map<string, GraphEdge[]>;
  edgeCount: number;
}

/**
 * Upper bound on a graph.json we will read into memory. Merged profile graphs
 * grow with every indexed workspace, so this must comfortably exceed a
 * multi-workspace merge — 64 MB was hit in practice by three monorepo-sized
 * workspaces. Reducing the number of indexed workspaces is the real lever;
 * this cap only guards against loading something pathologically large.
 */
export const MAX_GRAPH_BYTES = 256 * 1024 * 1024;

/** Why a graph could not be loaded — lets callers explain the real reason. */
export type GraphLoadFailure = 'absent' | 'too-large' | 'invalid';

export type GraphLoadResult =
  | { graph: KnowledgeGraph }
  | { failure: GraphLoadFailure; detail?: string };

function endpointId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

const MB = 1024 * 1024;

/**
 * Load a graphify graph.json (networkx node-link), reporting *why* it could not
 * be loaded so callers can distinguish "never built" from "built but too large
 * / corrupt" — the difference between a useful message and a misleading one.
 */
export async function loadGraphResult(filePath: string, maxBytes = MAX_GRAPH_BYTES): Promise<GraphLoadResult> {
  let raw: string;
  try {
    const info = await stat(filePath);
    if (info.size > maxBytes) {
      return { failure: 'too-large', detail: `${Math.round(info.size / MB)} MB exceeds the ${Math.round(maxBytes / MB)} MB load limit` };
    }
    raw = await readFile(filePath, 'utf8');
  } catch {
    return { failure: 'absent' };
  }

  let data: { nodes?: unknown; links?: unknown; edges?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return { failure: 'invalid', detail: 'file is not valid JSON' };
  }

  const rawLinks = Array.isArray(data?.links) ? data.links : Array.isArray(data?.edges) ? data.edges : null;
  if (!Array.isArray(data?.nodes) || !rawLinks) return { failure: 'invalid', detail: 'missing nodes/links arrays' };

  const graph: KnowledgeGraph = { nodes: new Map(), out: new Map(), in: new Map(), edgeCount: 0 };

  for (const node of data.nodes as Array<Record<string, unknown>>) {
    const id = endpointId(node?.id);
    if (!id) continue;
    graph.nodes.set(id, { ...node, id } as GraphNode);
  }

  for (const link of rawLinks as Array<Record<string, unknown>>) {
    const source = endpointId(link?.source);
    const target = endpointId(link?.target);
    if (!source || !target || !graph.nodes.has(source) || !graph.nodes.has(target)) continue;
    const relation = String(link.relation ?? link.label ?? link.type ?? 'RELATED');
    const edge: GraphEdge = { source, target, relation };
    if (!graph.out.has(source)) graph.out.set(source, []);
    if (!graph.in.has(target)) graph.in.set(target, []);
    graph.out.get(source)!.push(edge);
    graph.in.get(target)!.push(edge);
    graph.edgeCount += 1;
  }

  return { graph };
}

/** Convenience wrapper: the loaded graph, or null on any problem. */
export async function loadGraph(filePath: string, maxBytes = MAX_GRAPH_BYTES): Promise<KnowledgeGraph | null> {
  const result = await loadGraphResult(filePath, maxBytes);
  return 'graph' in result ? result.graph : null;
}
