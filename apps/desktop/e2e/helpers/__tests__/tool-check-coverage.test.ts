import { describe, expect, it } from 'vitest';
import { coverageProblems } from '../tool-check/coverage';
import type { InventoryEntry, ToolProbe } from '../tool-check/types';

const inventory: InventoryEntry[] = [
  { tool: 'notes', action: 'add', source: 'fixture' },
  { tool: 'notes', action: 'remove', source: 'fixture' },
  { tool: 'search', action: null, source: 'fixture' },
];

const pass = () => undefined;

function probes(overrides: Record<string, ToolProbe> = {}): ToolProbe[] {
  const table: Record<string, ToolProbe> = {
    notes: { tool: 'notes', steps: [{ action: 'add', params: {}, expect: pass }, { action: 'remove', params: {}, expect: pass }] },
    search: { tool: 'search', steps: [], exemptions: [{ action: null, reason: 'paid outside service', detail: 'Calls a paid search API.' }] },
  };
  return Object.values({ ...table, ...overrides });
}

describe('coverageProblems', () => {
  it('passes a table that covers every entry', () => {
    expect(coverageProblems(inventory, probes())).toEqual([]);
  });

  it('names a tool action with no scenario or exemption', () => {
    const problems = coverageProblems(inventory, probes({
      notes: { tool: 'notes', steps: [{ action: 'add', params: {}, expect: pass }] },
    }));
    expect(problems).toEqual([expect.stringContaining('notes remove')]);
  });

  it('names a stale entry', () => {
    const problems = coverageProblems(inventory, [
      ...probes(),
      { tool: 'gone', steps: [{ action: null, params: {}, expect: pass }] },
    ]);
    expect(problems).toEqual([expect.stringContaining('stale scenario step: gone')]);
  });

  it('fails an exemption with no reason', () => {
    const problems = coverageProblems(inventory, probes({
      search: { tool: 'search', steps: [], exemptions: [{ action: null, reason: 'paid outside service', detail: ' ' }] },
    }));
    expect(problems).toEqual(['exemption for search has no reason']);
  });

  it('fails an exemption whose reason is not one of the two allowed', () => {
    const problems = coverageProblems(inventory, probes({
      search: { tool: 'search', steps: [], exemptions: [{ action: null, reason: 'needs setup' as never, detail: 'Hard to set up.' }] },
    }));
    expect(problems).toEqual([expect.stringContaining('has reason "needs setup"')]);
  });
});
