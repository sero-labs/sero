import { beforeAll, describe, expect, it } from 'vitest';
import { coverageProblems } from '../../../e2e/helpers/tool-check/coverage';
import { TOOL_PROBES } from '../../../e2e/helpers/tool-check/table';
import type { InventoryEntry } from '../../../e2e/helpers/tool-check/types';
import { buildToolInventory } from './inventory';

let inventory: InventoryEntry[];

function actions(tool: string): Array<string | null> {
  return inventory.filter((entry) => entry.tool === tool).map((entry) => entry.action);
}

beforeAll(async () => {
  inventory = await buildToolInventory();
}, 60_000);

describe('tool inventory', () => {
  it('reads tools and actions from the code', () => {
    expect(actions('automation_browser')).toHaveLength(14);
    expect(actions('automation_browser')).toContain('stop_recording');
    expect(actions('orchestrator')).toEqual(expect.arrayContaining(['create', 'list', 'run_next']));
    expect(actions('sero workspace')).toEqual(expect.arrayContaining(['list', 'info', 'mount-plugin']));
    expect(actions('bash')).toEqual([null]);
    expect(actions('codemode')).toEqual([null]);
  });

  it('leaves out tools no agent can call', () => {
    expect(actions('goals')).toEqual([]);
  });
});

describe('tool coverage', () => {
  it('has a scenario or exemption for every tool action, and nothing stale', () => {
    expect(coverageProblems(inventory, TOOL_PROBES)).toEqual([]);
  });
});
