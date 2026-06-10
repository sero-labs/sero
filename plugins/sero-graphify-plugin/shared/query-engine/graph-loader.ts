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

export const MAX_GRAPH_BYTES = 64 * 1024 * 1024;

function endpointId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

/** Load a graphify graph.json (networkx node-link). Returns null on any problem — callers treat that as "no graph". */
export async function loadGraph(filePath: string, maxBytes = MAX_GRAPH_BYTES): Promise<KnowledgeGraph | null> {
  let raw: string;
  try {
    const info = await stat(filePath);
    if (info.size > maxBytes) return null;
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let data: { nodes?: unknown; links?: unknown; edges?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const rawLinks = Array.isArray(data?.links) ? data.links : Array.isArray(data?.edges) ? data.edges : null;
  if (!Array.isArray(data?.nodes) || !rawLinks) return null;

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

  return graph;
}
