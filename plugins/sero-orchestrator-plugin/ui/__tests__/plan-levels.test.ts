import { describe, expect, it } from 'vitest';
import { groupStepsByLevel } from '../lib/plan-levels';
import type { LoopStepDefinition } from '../../shared/types';

const step = (id: string, dependsOn?: string[]): LoopStepDefinition => ({
  id, title: id, instructions: id, dependsOn, execution: { type: 'background-agent' },
});

const ids = (groups: LoopStepDefinition[][]) => groups.map((g) => g.map((s) => s.id));

describe('groupStepsByLevel', () => {
  it('puts a sequential chain in one step per level', () => {
    const groups = groupStepsByLevel([step('a'), step('b', ['a']), step('c', ['b'])]);
    expect(ids(groups)).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups independent siblings into the same level', () => {
    const groups = groupStepsByLevel([
      step('root'),
      step('left', ['root']),
      step('right', ['root']),
      step('join', ['left', 'right']),
    ]);
    expect(ids(groups)).toEqual([['root'], ['left', 'right'], ['join']]);
  });

  it('places a fully independent set in a single level', () => {
    expect(ids(groupStepsByLevel([step('a'), step('b'), step('c')]))).toEqual([['a', 'b', 'c']]);
  });

  it('ignores dependencies on unknown steps', () => {
    expect(ids(groupStepsByLevel([step('a', ['ghost'])]))).toEqual([['a']]);
  });
});
