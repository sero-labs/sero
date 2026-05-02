import { describe, expect, it } from 'vitest';

import type { CommitNode } from '../../shared/types';
import { computeGraphLayout } from './graph-layout';

describe('computeGraphLayout', () => {
  it('collapses merged first-parent lanes once the parent already owns another lane', () => {
    const commits: CommitNode[] = [
      makeCommit('M', ['A', 'B']),
      makeCommit('A', ['C']),
      makeCommit('B', ['C']),
      makeCommit('C', ['D']),
      makeCommit('D', []),
    ];

    const layout = computeGraphLayout(commits);
    const lanesByHash = new Map(layout.nodes.map((node) => [node.commit.hash, node.lane]));
    const mergeEdge = layout.edges.find((edge) => edge.fromRow === 2 && edge.toRow === 3);

    expect(layout.maxLane).toBe(1);
    expect(lanesByHash.get('M')).toBe(0);
    expect(lanesByHash.get('A')).toBe(0);
    expect(lanesByHash.get('B')).toBe(1);
    expect(lanesByHash.get('C')).toBe(0);
    expect(mergeEdge).toMatchObject({ fromLane: 1, toLane: 0 });
  });
});

function makeCommit(hash: string, parents: string[]): CommitNode {
  return {
    hash,
    shortHash: hash,
    parents,
    authorName: 'Test User',
    authorEmail: 'test@example.com',
    authorDate: '2026-04-01T12:00:00.000Z',
    subject: hash,
    refs: [],
  };
}
