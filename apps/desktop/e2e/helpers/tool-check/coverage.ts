import { EXEMPTION_REASONS, type InventoryEntry, type ToolProbe } from './types';

function label(tool: string, action: string | null): string {
  return action === null ? tool : `${tool} ${action}`;
}

function key(tool: string, action: string | null): string {
  return `${tool}\u0000${action ?? ''}`;
}

/**
 * Compares the probe table with the inventory. Returns one line per problem:
 * an inventory entry with no scenario or exemption, a table entry for a tool
 * or action that no longer exists, an exemption with no reason, or an action
 * that is both tested and exempt.
 */
export function coverageProblems(inventory: InventoryEntry[], probes: ToolProbe[]): string[] {
  const problems: string[] = [];
  const known = new Set(inventory.map((entry) => key(entry.tool, entry.action)));
  const covered = new Set<string>();
  const seenTools = new Set<string>();

  for (const probe of probes) {
    if (seenTools.has(probe.tool)) problems.push(`${probe.tool}: more than one probe module`);
    seenTools.add(probe.tool);

    const tested = new Set(probe.steps.map((step) => key(probe.tool, step.action)));
    for (const step of probe.steps) {
      const k = key(probe.tool, step.action);
      if (!known.has(k)) problems.push(`stale scenario step: ${label(probe.tool, step.action)} is not a tool action`);
      covered.add(k);
    }
    for (const exemption of probe.exemptions ?? []) {
      const k = key(probe.tool, exemption.action);
      const name = label(probe.tool, exemption.action);
      if (!known.has(k)) problems.push(`stale exemption: ${name} is not a tool action`);
      if (!EXEMPTION_REASONS.includes(exemption.reason)) {
        problems.push(`exemption for ${name} has reason ${JSON.stringify(exemption.reason)}; allowed: ${EXEMPTION_REASONS.join(', ')}`);
      }
      if (!exemption.detail?.trim()) problems.push(`exemption for ${name} has no reason`);
      if (tested.has(k)) problems.push(`${name} is both tested and exempt`);
      covered.add(k);
    }
  }

  for (const entry of inventory) {
    if (!covered.has(key(entry.tool, entry.action))) {
      problems.push(`no scenario or exemption for ${label(entry.tool, entry.action)} (${entry.source})`);
    }
  }
  return problems;
}
