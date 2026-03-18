/**
 * Commit graph layout algorithm.
 *
 * Assigns lanes (columns) to commits so that branches are
 * visually separated. Produces connection data for SVG rendering.
 */

import type { CommitNode } from '../../shared/types';

export interface GraphNode {
  commit: CommitNode;
  row: number;
  lane: number;
  color: string;
}

export interface GraphEdge {
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  color: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxLane: number;
}

const COLORS = [
  '#818cf8', '#f59e0b', '#34d399', '#f472b6', '#60a5fa',
  '#f87171', '#a78bfa', '#2dd4bf', '#fb923c', '#22d3ee',
  '#e879f9', '#a3e635',
];

/**
 * Compute a lane-based layout for a topologically-sorted commit list.
 *
 * The algorithm walks commits top-to-bottom (newest first).
 * Each commit inherits its first parent's lane; second+ parents
 * open new lanes. Lanes are freed when a commit has no more
 * children using that lane.
 */
export function computeGraphLayout(commits: CommitNode[]): GraphLayout {
  if (commits.length === 0) return { nodes: [], edges: [], maxLane: 0 };

  const hashToRow = new Map<string, number>();
  commits.forEach((c, i) => hashToRow.set(c.hash, i));

  // Track which lane each commit occupies
  const hashToLane = new Map<string, number>();
  const hashToColor = new Map<string, string>();

  // Active lanes: array of commit hashes occupying each lane (null = free)
  const lanes: (string | null)[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  function findFreeLane(): number {
    const idx = lanes.indexOf(null);
    if (idx !== -1) return idx;
    lanes.push(null);
    return lanes.length - 1;
  }

  function getColor(lane: number): string {
    return COLORS[lane % COLORS.length];
  }

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    let lane: number;

    if (hashToLane.has(commit.hash)) {
      // Lane was reserved by a child commit
      lane = hashToLane.get(commit.hash)!;
    } else {
      // New branch head — assign a free lane
      lane = findFreeLane();
      lanes[lane] = commit.hash;
    }

    const color = hashToColor.get(commit.hash) ?? getColor(lane);
    hashToLane.set(commit.hash, lane);
    hashToColor.set(commit.hash, color);

    nodes.push({ commit, row, lane, color });

    // Process parents
    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentHash = commit.parents[pi];
      const parentRow = hashToRow.get(parentHash);
      if (parentRow === undefined) continue; // parent not in visible range

      if (pi === 0) {
        // First parent: inherit this commit's lane
        if (!hashToLane.has(parentHash)) {
          hashToLane.set(parentHash, lane);
          hashToColor.set(parentHash, color);
          lanes[lane] = parentHash;
        }
        edges.push({
          fromRow: row,
          fromLane: lane,
          toRow: parentRow,
          toLane: hashToLane.get(parentHash) ?? lane,
          color,
        });
      } else {
        // Merge parent: may need a new lane
        if (!hashToLane.has(parentHash)) {
          const mergeLane = findFreeLane();
          hashToLane.set(parentHash, mergeLane);
          hashToColor.set(parentHash, getColor(mergeLane));
          lanes[mergeLane] = parentHash;
        }
        const parentLane = hashToLane.get(parentHash)!;
        edges.push({
          fromRow: row,
          fromLane: lane,
          toRow: parentRow,
          toLane: parentLane,
          color: hashToColor.get(parentHash) ?? color,
        });
      }
    }

    // Free lane if no parent will use it
    if (commit.parents.length === 0) {
      lanes[lane] = null;
    }
  }

  const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
  return { nodes, edges, maxLane };
}
