import type { JjRunner } from './jj-runner';
import { BOOKMARK_TEMPLATE, parseBookmarks, parseDiffSummary, parseRemotes } from './parsers';
import type {
  Bookmark,
  CreatePullRequestInput,
  CreatePullRequestResult,
  FileDiffEntry,
  PullRequestPreview,
  PullRequestRef,
  PullRequestState,
} from '../../src/types/vcs';

const DEFAULT_BASE_BRANCH = 'main';
const FALLBACK_BASE_BRANCH = 'master';
const DIFF_PATCH_LIMIT = 32_000;

interface DiffResult {
  files: FileDiffEntry[];
  comparisonBase: string;
}

export interface PullRequestDraftContext {
  preview: PullRequestPreview;
  fileSummary: string;
  patch: string;
}

export class VcsPullRequestOps {
  constructor(private readonly runner: JjRunner) {}

  private async listBookmarks(workspaceId: string): Promise<Bookmark[]> {
    const result = await this.runner.run(workspaceId, [
      'bookmark',
      'list',
      '--all-remotes',
      '-T',
      BOOKMARK_TEMPLATE,
    ]);
    if (result.exitCode !== 0) return [];
    return parseBookmarks(result.stdout);
  }

  private async resolveRemote(workspaceId: string): Promise<string | undefined> {
    const result = await this.runner.run(workspaceId, ['git', 'remote', 'list']);
    if (result.exitCode !== 0) return undefined;
    const remotes = parseRemotes(result.stdout);
    return remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name;
  }

  private async resolveDefaultBaseBranch(
    workspaceId: string,
    allBranchNames: Set<string>,
  ): Promise<string> {
    const remote = await this.resolveRemote(workspaceId);
    if (remote) {
      const headRef = await this.runner.runCommand(
        workspaceId,
        'git',
        ['symbolic-ref', `refs/remotes/${remote}/HEAD`],
      );
      if (headRef.exitCode === 0) {
        const head = headRef.stdout.trim();
        const prefix = `refs/remotes/${remote}/`;
        if (head.startsWith(prefix)) {
          const branch = head.slice(prefix.length).trim();
          if (branch) return branch;
        }
      }
    }

    if (allBranchNames.has(DEFAULT_BASE_BRANCH)) return DEFAULT_BASE_BRANCH;
    if (allBranchNames.has(FALLBACK_BASE_BRANCH)) return FALLBACK_BASE_BRANCH;

    const first = Array.from(allBranchNames).sort((a, b) => a.localeCompare(b))[0];
    return first ?? DEFAULT_BASE_BRANCH;
  }

  async getState(workspaceId: string): Promise<PullRequestState> {
    const bookmarks = await this.listBookmarks(workspaceId);
    const sourceBranches = Array.from(
      new Set(
        bookmarks
          .filter((b) => b.isLocal)
          .map((b) => b.name.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const allBranchNames = new Set<string>();
    for (const bm of bookmarks) {
      const name = bm.name.trim();
      if (name) allBranchNames.add(name);
    }
    for (const source of sourceBranches) allBranchNames.add(source);

    const defaultBaseBranch = await this.resolveDefaultBaseBranch(workspaceId, allBranchNames);
    allBranchNames.add(defaultBaseBranch);

    const targetBranches = Array.from(allBranchNames).sort((a, b) => {
      if (a === defaultBaseBranch) return -1;
      if (b === defaultBaseBranch) return 1;
      return a.localeCompare(b);
    });

    return { defaultBaseBranch, sourceBranches, targetBranches };
  }

  private resolveSourceBranch(state: PullRequestState, sourceBranch?: string): string {
    const requested = sourceBranch?.trim();
    if (requested) return requested;

    return (
      state.sourceBranches.find((b) => b !== state.defaultBaseBranch)
      ?? state.sourceBranches[0]
      ?? ''
    );
  }

  private resolveTargetBranch(state: PullRequestState, targetBranch?: string): string {
    const requested = targetBranch?.trim();
    return requested || state.defaultBaseBranch;
  }

  private async compareBranches(
    workspaceId: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<DiffResult> {
    const remote = await this.resolveRemote(workspaceId);
    const candidates = new Set<string>([targetBranch]);
    if (remote && !targetBranch.includes('@')) {
      candidates.add(`${targetBranch}@${remote}`);
    }

    let lastErr = '';
    for (const candidate of candidates) {
      const result = await this.runner.run(workspaceId, [
        'diff',
        '--summary',
        '--from',
        candidate,
        '--to',
        sourceBranch,
      ]);

      if (result.exitCode === 0) {
        return {
          files: parseDiffSummary(result.stdout),
          comparisonBase: candidate,
        };
      }
      lastErr = result.stderr || `Failed to diff ${candidate}..${sourceBranch}`;
    }

    throw new Error(lastErr || `Failed to compare ${targetBranch} and ${sourceBranch}`);
  }

  private async findExistingOpenPr(
    workspaceId: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<PullRequestRef | undefined> {
    const result = await this.runner.runCommand(
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

  async preview(
    workspaceId: string,
    sourceBranch?: string,
    targetBranch?: string,
  ): Promise<PullRequestPreview> {
    const state = await this.getState(workspaceId);
    const source = this.resolveSourceBranch(state, sourceBranch);
    const target = this.resolveTargetBranch(state, targetBranch);

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
        blockingReason: `Branch '${source}' is not a local bookmark. Push from a local branch first.`,
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
      diff = await this.compareBranches(workspaceId, source, target);
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

    const existingPr = await this.findExistingOpenPr(workspaceId, source, target);
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

  private async getDiffPatch(
    workspaceId: string,
    comparisonBase: string,
    sourceBranch: string,
  ): Promise<string> {
    const result = await this.runner.run(
      workspaceId,
      ['diff', '--git', '--from', comparisonBase, '--to', sourceBranch],
      120_000,
    );
    if (result.exitCode !== 0) return '';

    const patch = result.stdout.trim();
    if (patch.length <= DIFF_PATCH_LIMIT) return patch;
    return `${patch.slice(0, DIFF_PATCH_LIMIT)}\n\n...[patch truncated]`;
  }

  async buildDraftContext(
    workspaceId: string,
    sourceBranch?: string,
    targetBranch?: string,
  ): Promise<PullRequestDraftContext> {
    const preview = await this.preview(workspaceId, sourceBranch, targetBranch);
    if (preview.blockingReason || !preview.hasChanges) {
      throw new Error(preview.blockingReason || 'No changes available for pull request draft');
    }

    const fileSummary = preview.files
      .map((f) => `${statusSymbol(f.status)} ${f.path}`)
      .join('\n');
    const patch = await this.getDiffPatch(
      workspaceId,
      preview.comparisonBase,
      preview.sourceBranch,
    );

    return { preview, fileSummary, patch };
  }

  private formatCreatePrError(stderr: string, stdout: string): string {
    const message = (stderr || stdout || 'Failed to create pull request').trim();
    const lower = message.toLowerCase();

    if (lower.includes('enoent') || lower.includes('not found') || lower.includes('cannot run gh')) {
      return "GitHub CLI (`gh`) is not available in this workspace runtime. Install `gh` and retry.";
    }
    if (lower.includes('authentication')) {
      return `${message}\nRun \`gh auth login\` in this workspace runtime and retry.`;
    }
    return message;
  }

  async create(
    workspaceId: string,
    input: CreatePullRequestInput,
  ): Promise<CreatePullRequestResult> {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title) return { success: false, message: 'Pull request title is required.' };
    if (!body) return { success: false, message: 'Pull request description is required.' };

    const preview = await this.preview(workspaceId, input.sourceBranch, input.targetBranch);
    if (preview.blockingReason || !preview.hasChanges) {
      return {
        success: false,
        message: preview.blockingReason || 'No changes available to open a pull request.',
      };
    }
    if (preview.existingPr?.url) {
      return {
        success: false,
        message: `An open pull request already exists for this branch pair: ${preview.existingPr.url}`,
        url: preview.existingPr.url,
        number: preview.existingPr.number,
      };
    }

    // Verify the source branch has been pushed — gh pr create will fail with a
    // confusing GitHub API error if the branch only exists locally.
    const bookmarks = await this.listBookmarks(workspaceId);
    const sourceBm = bookmarks.find((b) => b.name === preview.sourceBranch);
    if (sourceBm && sourceBm.remoteStatuses.length === 0) {
      return {
        success: false,
        message: `Branch '${preview.sourceBranch}' has not been pushed to a remote. Push the branch first, then create the PR.`,
      };
    }

    const args = [
      'pr',
      'create',
      '--head',
      preview.sourceBranch,
      '--base',
      preview.targetBranch,
      '--title',
      title,
      '--body',
      body,
    ];
    if (input.draft) args.push('--draft');

    const result = await this.runner.runCommand(workspaceId, 'gh', args, 120_000);
    if (result.exitCode !== 0) {
      return {
        success: false,
        message: this.formatCreatePrError(result.stderr, result.stdout),
      };
    }

    const url = extractGithubPrUrl(result.stdout) ?? extractGithubPrUrl(result.stderr);
    return {
      success: true,
      message: url ? `Pull request created: ${url}` : 'Pull request created successfully.',
      url,
    };
  }
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

function extractGithubPrUrl(text: string): string | undefined {
  const match = text.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match?.[0];
}

