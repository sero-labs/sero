/**
 * Tests for wave-resolver — dependency-ordered execution wave grouping.
 */

import { describe, it, expect } from 'vitest';
import { resolveExecutionWaves } from '../../../features/kanban/core/wave-resolver';
import type { Subtask } from '../../../features/kanban/core/types';

function makeSubtask(id: string, dependsOn: string[] = []): Subtask {
  return { id, title: `Task ${id}`, description: '', status: 'pending', dependsOn };
}

describe('resolveExecutionWaves', () => {
  it('returns empty array for no subtasks', () => {
    expect(resolveExecutionWaves([])).toEqual([]);
  });

  it('puts all independent subtasks in one wave', () => {
    const subtasks = [makeSubtask('1'), makeSubtask('2'), makeSubtask('3')];
    const waves = resolveExecutionWaves(subtasks);
    expect(waves).toEqual([['1', '2', '3']]);
  });

  it('respects linear dependency chain', () => {
    const subtasks = [
      makeSubtask('1'),
      makeSubtask('2', ['1']),
      makeSubtask('3', ['2']),
    ];
    const waves = resolveExecutionWaves(subtasks);
    expect(waves).toEqual([['1'], ['2'], ['3']]);
  });

  it('groups parallel subtasks with shared dependency', () => {
    const subtasks = [
      makeSubtask('1'),
      makeSubtask('2', ['1']),
      makeSubtask('3', ['1']),
      makeSubtask('4', ['2', '3']),
    ];
    const waves = resolveExecutionWaves(subtasks);
    expect(waves).toEqual([['1'], ['2', '3'], ['4']]);
  });

  it('handles diamond dependency pattern', () => {
    // 1 → 2, 1 → 3, 2 → 4, 3 → 4
    const subtasks = [
      makeSubtask('1'),
      makeSubtask('2', ['1']),
      makeSubtask('3', ['1']),
      makeSubtask('4', ['2', '3']),
    ];
    const waves = resolveExecutionWaves(subtasks);
    expect(waves[0]).toEqual(['1']);
    expect(waves[1]).toContain('2');
    expect(waves[1]).toContain('3');
    expect(waves[2]).toEqual(['4']);
  });

  it('handles circular dependencies by forcing remaining into final wave', () => {
    const subtasks = [
      makeSubtask('1', ['2']),
      makeSubtask('2', ['1']),
    ];
    const waves = resolveExecutionWaves(subtasks);
    // Should force both into a single wave rather than infinite loop
    expect(waves.length).toBeGreaterThanOrEqual(1);
    const allIds = waves.flat();
    expect(allIds).toContain('1');
    expect(allIds).toContain('2');
  });

  it('ignores dependencies that reference non-existent subtasks', () => {
    const subtasks = [
      makeSubtask('1', ['999']),
      makeSubtask('2', ['1']),
    ];
    const waves = resolveExecutionWaves(subtasks);
    // '999' doesn't exist, so '1' should have no real deps
    expect(waves[0]).toEqual(['1']);
    expect(waves[1]).toEqual(['2']);
  });

  it('handles single subtask', () => {
    const waves = resolveExecutionWaves([makeSubtask('1')]);
    expect(waves).toEqual([['1']]);
  });

  it('handles complex multi-wave scenario', () => {
    // Wave 1: A, B (no deps)
    // Wave 2: C (depends on A), D (depends on B)
    // Wave 3: E (depends on C, D)
    const subtasks = [
      makeSubtask('A'),
      makeSubtask('B'),
      makeSubtask('C', ['A']),
      makeSubtask('D', ['B']),
      makeSubtask('E', ['C', 'D']),
    ];
    const waves = resolveExecutionWaves(subtasks);
    expect(waves.length).toBe(3);
    expect(waves[0]).toContain('A');
    expect(waves[0]).toContain('B');
    expect(waves[1]).toContain('C');
    expect(waves[1]).toContain('D');
    expect(waves[2]).toEqual(['E']);
  });
});
