/**
 * Demo video upload and PR attachment logic.
 *
 * Handles uploading the generated demo video to GitHub (via release assets)
 * and posting it as a comment on the pull request.
 */

import type { GitRunner } from './git-runner';
import type { PullRequestPreview } from '../../src/types/vcs';
import { generateDemoVideo } from './demo-video';

/**
 * Generate a demo video from the PR diff and attach it as a comment.
 */
export async function attachDemoVideoToPr(
  runner: GitRunner,
  workspaceId: string,
  preview: PullRequestPreview,
  prNumber: number,
): Promise<void> {
  const video = await generateDemoVideo(runner, {
    workspaceId,
    sourceBranch: preview.sourceBranch,
    targetBranch: preview.targetBranch,
    comparisonBase: preview.comparisonBase,
    files: preview.files,
  });

  // Upload the video file to the repo and comment on the PR.
  // GitHub doesn't support direct file uploads via `gh`, so we upload
  // the video as a release asset to a "demo-videos" tag, then reference
  // it in a PR comment. If that fails, we note the local path instead.
  const videoUrl = await uploadVideoAsset(runner, workspaceId, video.filePath, video.fileName);

  const commentBody = videoUrl
    ? `## Demo Video\n\nA walkthrough of the changes in this PR:\n\n<video src="${videoUrl}" controls width="100%"></video>`
    : `## Demo Video\n\nA demo video was generated but could not be uploaded. The video file is available locally at: \`${video.filePath}\``;

  await runner.runCommand(
    workspaceId,
    'gh',
    ['pr', 'comment', String(prNumber), '--body', commentBody],
    60_000,
  );
}

/**
 * Upload a video file as a GitHub release asset and return its download URL.
 * Uses a dedicated "sero-demo-videos" release tag.
 */
async function uploadVideoAsset(
  runner: GitRunner,
  workspaceId: string,
  filePath: string,
  fileName: string,
): Promise<string | undefined> {
  const tag = 'sero-demo-videos';

  // Ensure the release exists
  const checkRelease = await runner.runCommand(
    workspaceId,
    'gh',
    ['release', 'view', tag, '--json', 'tagName'],
    30_000,
  );
  if (checkRelease.exitCode !== 0) {
    const createRelease = await runner.runCommand(
      workspaceId,
      'gh',
      [
        'release', 'create', tag,
        '--title', 'Sero Demo Videos',
        '--notes', 'Auto-generated demo videos for pull requests.',
        '--latest=false',
      ],
      30_000,
    );
    if (createRelease.exitCode !== 0) return undefined;
  }

  // Upload the asset
  const upload = await runner.runCommand(
    workspaceId,
    'gh',
    ['release', 'upload', tag, filePath, '--clobber'],
    120_000,
  );
  if (upload.exitCode !== 0) return undefined;

  // Get the asset URL
  const assetList = await runner.runCommand(
    workspaceId,
    'gh',
    ['release', 'view', tag, '--json', 'assets'],
    30_000,
  );
  if (assetList.exitCode !== 0) return undefined;

  try {
    const parsed = JSON.parse(assetList.stdout) as {
      assets?: Array<{ name?: string; url?: string }>;
    };
    const asset = parsed.assets?.find((a) => a.name === fileName);
    return asset?.url;
  } catch {
    return undefined;
  }
}
