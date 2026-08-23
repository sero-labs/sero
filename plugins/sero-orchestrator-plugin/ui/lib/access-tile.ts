/**
 * The Access tile of the consent band (prototype screen 4): the computed
 * access entries folded into one short phrase — `This workspace and GitHub`
 * over `read, edit, push`. Pure formatting over the fixed access mapping;
 * nothing here widens or narrows what the entries say.
 */

import type { AccessSummaryEntry } from '../../shared/room-blueprint-types';
import type { AccessLabel } from '../../shared/room-blueprint-types';

interface LabelFacet {
  /** What it reaches, in tile order. */
  target?: string;
  /** What it may do there, in tile order. */
  mode?: string;
}

const FACETS: Record<AccessLabel, LabelFacet> = {
  'read-workspace': { target: 'This workspace', mode: 'read' },
  'edit-workspace': { target: 'This workspace', mode: 'edit' },
  'edit-working-files-directly': { target: 'This workspace', mode: 'edit' },
  'read-github': { target: 'GitHub', mode: 'read' },
  'github-write': { target: 'GitHub', mode: 'push' },
  'run-commands': { mode: 'run commands' },
  'reach-internet': { target: 'the internet' },
  deployment: { target: 'live systems', mode: 'deploy' },
  'send-outside-sero': { target: 'outside Sero', mode: 'send' },
  'other-tools': { target: 'other tools' },
};

const TARGET_ORDER = ['This workspace', 'GitHub', 'the internet', 'live systems', 'outside Sero', 'other tools'];
const MODE_ORDER = ['read', 'edit', 'push', 'run commands', 'deploy', 'send'];

function ordered(values: Set<string>, order: string[]): string[] {
  return order.filter((value) => values.has(value));
}

/** `This workspace and GitHub` — two joined by and, more by commas then and. */
function joinPhrase(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface AccessTile {
  value: string;
  sub: string;
}

export function accessTile(entries: AccessSummaryEntry[]): AccessTile {
  const targets = new Set<string>();
  const modes = new Set<string>();
  for (const entry of entries) {
    const facet = FACETS[entry.label];
    if (facet.target) targets.add(facet.target);
    if (facet.mode) modes.add(facet.mode);
  }
  if (targets.size === 0 && modes.size === 0) {
    return { value: 'Nothing outside the Room', sub: '' };
  }
  return {
    value: joinPhrase(ordered(targets, TARGET_ORDER)) || 'This workspace',
    sub: ordered(modes, MODE_ORDER).join(', '),
  };
}
