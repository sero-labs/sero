import type {
  CreatePullRequestInput,
  CreatePullRequestResult,
  PullRequestPreview,
  PullRequestState,
} from '@sero/common';

import type { GitRunner } from './git-runner';
import { executeCreatePullRequest } from './pr-ops/create';
import {
  buildPullRequestPreview,
  formatFileSummary,
  getDiffPatch,
} from './pr-ops/preview';
import { getPullRequestState, listBranches } from './pr-ops/state';

export interface PullRequestDraftContext {
  preview: PullRequestPreview;
  fileSummary: string;
  patch: string;
}

export class VcsPullRequestOps {
  constructor(private readonly runner: GitRunner) {}

  async getState(workspaceId: string): Promise<PullRequestState> {
    return getPullRequestState(this.runner, workspaceId);
  }

  async preview(
    workspaceId: string,
    sourceBranch?: string,
    targetBranch?: string,
  ): Promise<PullRequestPreview> {
    const state = await this.getState(workspaceId);
    return buildPullRequestPreview(
      this.runner,
      workspaceId,
      state,
      sourceBranch,
      targetBranch,
    );
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

    const fileSummary = formatFileSummary(preview.files);
    const patch = await getDiffPatch(
      this.runner,
      workspaceId,
      preview.comparisonBase,
      preview.sourceBranch,
    );

    return { preview, fileSummary, patch };
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

    // Verify the source branch has been pushed
    const branches = await listBranches(this.runner, workspaceId);
    const sourceBranch = branches.find((branch) => branch.name === preview.sourceBranch);
    if (sourceBranch && sourceBranch.remoteStatuses.length === 0) {
      return {
        success: false,
        message: `Branch '${preview.sourceBranch}' has not been pushed to a remote. Push the branch first, then create the PR.`,
      };
    }

    return executeCreatePullRequest(this.runner, workspaceId, {
      sourceBranch: preview.sourceBranch,
      targetBranch: preview.targetBranch,
      title,
      body,
      draft: input.draft,
    });
  }
}
