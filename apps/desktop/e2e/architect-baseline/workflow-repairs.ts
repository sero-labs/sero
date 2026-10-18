/**
 * Protocol failures of an Architect run: the repair passes its Workflow steps
 * needed because a reply broke the step's result contract. Each step attempt
 * saves its count in its run file. Read after the run, from the workspace.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ORCHESTRATOR_INDEX_FILE } from '@sero-ai/common';

const list = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** Sums every `repairs` count in a run file. A field that is absent counts nothing. */
function countRepairs(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total: number, item) => total + countRepairs(item), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((total, [key, item]) => total + (key === 'repairs' && typeof item === 'number' ? item : countRepairs(item)), 0);
}

/** Null when the workspace ran no Workflow, so "no Workflow" is not read as "no failure". */
export function workflowRepairs(workspacePath: string): { repairs: number; runs: number } | null {
  const loops = path.join(workspacePath, path.dirname(ORCHESTRATOR_INDEX_FILE), 'loops');
  let repairs = 0;
  let runs = 0;
  for (const loop of list(loops)) {
    for (const file of list(path.join(loops, loop, 'runs'))) {
      if (!file.endsWith('.json') || file === 'index.json') continue;
      try {
        repairs += countRepairs(JSON.parse(fs.readFileSync(path.join(loops, loop, 'runs', file), 'utf8')));
        runs += 1;
      } catch {
        // A run file being written is skipped; the count is then a lower bound.
      }
    }
  }
  return runs > 0 ? { repairs, runs } : null;
}
