// Evidence gathering for verification-plan criteria (spec 05 §4.1). Read-only /
// measurement gathering, run at the canonical attempt cwd (D-06) before a
// criterion's decision. The gathered bundle feeds the judge (judge.ts) and the
// measurement extractor (P-C). All gathering goes through host seams so it
// targets the same tree the worker changed.

import type { AppRuntimeHost } from '@sero-ai/common';

import type { EvidenceKind, EvidenceStep } from '../shared/types';

export interface EvidenceItem {
  kind: EvidenceKind;
  /** What was gathered (judge/UI facing), e.g. `$ pnpm build` or `read CHANGELOG`. */
  label: string;
  /** stdout / file contents / diff text / log text. */
  content: string;
  /** For `run` evidence: 0 on success, 1 on failure. */
  exitCode?: number;
}

export interface GatheredEvidence {
  items: EvidenceItem[];
}

export interface GatherEvidenceDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  cwd: string;
  /** Per-command timeout (RunBudget.maxCommandRuntimeMs); host default when undefined. */
  commandTimeoutMs?: number;
}

/** Gather every evidence step in order at the attempt cwd. */
export async function gatherEvidence(
  deps: GatherEvidenceDeps,
  evidence: EvidenceStep[],
): Promise<GatheredEvidence> {
  const items: EvidenceItem[] = [];
  for (const step of evidence) {
    items.push(await gatherOne(deps, step));
  }
  return { items };
}

async function gatherOne(deps: GatherEvidenceDeps, step: EvidenceStep): Promise<EvidenceItem> {
  switch (step.kind) {
    case 'run': {
      const verification = await deps.host.verification.runCommands(
        deps.workspaceId,
        deps.cwd,
        [step.command],
        deps.commandTimeoutMs,
      );
      const result = verification.results[0];
      return {
        kind: 'run',
        label: `$ ${step.command}`,
        content: joinOutput(result?.stdout, result?.stderr),
        exitCode: result ? (result.success ? 0 : 1) : undefined,
      };
    }
    case 'read': {
      const out = await deps.host.workspace.runCommand(
        deps.workspaceId,
        deps.cwd,
        `cat -- ${shellQuote(step.path)}`,
        deps.commandTimeoutMs,
      );
      return { kind: 'read', label: `read ${step.path}`, content: out.stdout };
    }
    case 'diff': {
      const diff = await deps.host.git.getDiff(deps.cwd);
      return { kind: 'diff', label: 'diff', content: diff };
    }
    case 'gitLog': {
      const command = step.since
        ? `git log --oneline --since=${shellQuote(step.since)}`
        : 'git log --oneline -n 50';
      const out = await deps.host.workspace.runCommand(
        deps.workspaceId,
        deps.cwd,
        command,
        deps.commandTimeoutMs,
      );
      return {
        kind: 'gitLog',
        label: step.since ? `git log since ${step.since}` : 'git log',
        content: out.stdout,
      };
    }
  }
}

/** Render an evidence bundle as labelled blocks for a judge prompt. */
export function formatEvidence(bundle: GatheredEvidence): string {
  if (bundle.items.length === 0) return '(no evidence gathered)';
  return bundle.items
    .map((item) => {
      const head = item.exitCode === undefined ? `### ${item.label}` : `### ${item.label} (exit ${item.exitCode})`;
      return `${head}\n${item.content.trim() || '(empty)'}`;
    })
    .join('\n\n');
}

function joinOutput(stdout?: string, stderr?: string): string {
  return [stdout, stderr].filter((part) => part && part.trim()).join('\n');
}

function shellQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}
