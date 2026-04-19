import type {
  FileDiffEntry,
  PullRequestPreview,
  PullRequestRef,
  PullRequestState,
} from '@sero-ai/common';

import { parseDiffSummary } from '../../support/parsers';
import type { GitRunner } from '../git-runner';
import { resolveSourceBranch, resolveTargetBranch } from './state';

const DIFF_PATCH_LIMIT = 32_000;

interface DiffResult {
  files: FileDiffEntry[];
  comparisonBase: string;
}

async function compareBranches(
  runner: GitRunner,
  workspaceId: string,
  sourceBranch: string,
  targetBranch: string,
): Promise<DiffResult> {
  // Use the merge-base for three-dot diff semantics
  const mergeBase = await runner.run(workspaceId, [
    'merge-base',
    targetBranch,
    sourceBranch,
  ]);

  const base = mergeBase.exitCode === 0 ? mergeBase.stdout.trim() : targetBranch;

  const result = await runner.run(workspaceId, [
    'diff',
    '--name-status',
    `${base}..${sourceBranch}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to diff ${targetBranch}..${sourceBranch}`);
  }

  return {
    files: parseDiffSummary(result.stdout),
    comparisonBase: base,
  };
}

async function findExistingOpenPr(
  runner: GitRunner,
  workspaceId: string,
  sourceBranch: string,
  targetBranch: string,
): Promise<PullRequestRef | undefined> {
  const result = await runner.runCommand(
    workspaceId,
    'gh',
    [
      'pr',
      'list',
      '--head',
      sourceBranch,
      '--base',
      targetBranch,
      '--state',
      'open',
      '--limit',
      '1',
      '--json',
      'url,number,title,baseRefName',
    ],
    60_000,
  );
  if (result.exitCode !== 0 || !result.stdout.trim()) return undefined;

  try {
    const parsed = JSON.parse(result.stdout) as Array<{
      url?: string;
      number?: number;
      title?: string;
      baseRefName?: string;
    }>;
    const first = parsed[0];
    if (!first?.url || typeof first.number !== 'number' || !first.title) return undefined;
    return {
      url: first.url,
      number: first.number,
      title: first.title,
      baseBranch: first.baseRefName ?? targetBranch,
    };
  } catch {
    return undefined;
  }
}

export async function buildPullRequestPreview(
  runner: GitRunner,
  workspaceId: string,
  state: PullRequestState,
  sourceBranch?: string,
  targetBranch?: string,
): Promise<PullRequestPreview> {
  const source = resolveSourceBranch(state, sourceBranch);
  const target = resolveTargetBranch(state, targetBranch);

  if (!source) {
    return {
      sourceBranch: '',
      targetBranch: target,
      defaultBaseBranch: state.defaultBaseBranch,
      comparisonBase: target,
      hasChanges: false,
      changedFiles: 0,
      files: [],
      blockingReason: 'No local branches are available to open a pull request from.',
    };
  }

  if (!state.sourceBranches.includes(source)) {
    return {
      sourceBranch: source,
      targetBranch: target,
      defaultBaseBranch: state.defaultBaseBranch,
      comparisonBase: target,
      hasChanges: false,
      changedFiles: 0,
      files: [],
      blockingReason: `Branch '${source}' is not a local branch. Push from a local branch first.`,
    };
  }

  if (source === state.defaultBaseBranch) {
    return {
      sourceBranch: source,
      targetBranch: target,
      defaultBaseBranch: state.defaultBaseBranch,
      comparisonBase: target,
      hasChanges: false,
      changedFiles: 0,
      files: [],
      blockingReason: `Source branch '${source}' is the default branch. Choose a feature branch.`,
    };
  }

  if (source === target) {
    return {
      sourceBranch: source,
      targetBranch: target,
      defaultBaseBranch: state.defaultBaseBranch,
      comparisonBase: target,
      hasChanges: false,
      changedFiles: 0,
      files: [],
      blockingReason: 'Source and target branches cannot be the same.',
    };
  }

  let diff: DiffResult;
  try {
    diff = await compareBranches(runner, workspaceId, source, target);
  } catch (err) {
    return {
      sourceBranch: source,
      targetBranch: target,
      defaultBaseBranch: state.defaultBaseBranch,
      comparisonBase: target,
      hasChanges: false,
      changedFiles: 0,
      files: [],
      blockingReason: err instanceof Error ? err.message : 'Failed to compare branches',
    };
  }

  if (diff.files.length === 0) {
    return {
      sourceBranch: source,
      targetBranch: target,
      defaultBaseBranch: state.defaultBaseBranch,
      comparisonBase: diff.comparisonBase,
      hasChanges: false,
      changedFiles: 0,
      files: [],
      blockingReason: `No changes found between '${source}' and '${target}'.`,
    };
  }

  const existingPr = await findExistingOpenPr(runner, workspaceId, source, target);
  return {
    sourceBranch: source,
    targetBranch: target,
    defaultBaseBranch: state.defaultBaseBranch,
    comparisonBase: diff.comparisonBase,
    hasChanges: true,
    changedFiles: diff.files.length,
    files: diff.files,
    existingPr,
  };
}

export async function getDiffPatch(
  runner: GitRunner,
  workspaceId: string,
  comparisonBase: string,
  sourceBranch: string,
): Promise<string> {
  const result = await runner.run(
    workspaceId,
    ['diff', `${comparisonBase}..${sourceBranch}`],
    120_000,
  );
  if (result.exitCode !== 0) return '';

  const patch = result.stdout.trim();
  if (patch.length <= DIFF_PATCH_LIMIT) return patch;
  return `${patch.slice(0, DIFF_PATCH_LIMIT)}\n\n...[patch truncated]`;
}

function statusSymbol(status: FileDiffEntry['status']): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'conflict':
      return '!';
    default:
      return 'M';
  }
}

export function formatFileSummary(files: FileDiffEntry[]): string {
  return files
    .map((file) => `${statusSymbol(file.status)} ${file.path}`)
    .join('\n');
}
