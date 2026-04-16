import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface PullRequestView {
  state?: string;
  mergedAt?: string | null;
}

function extractErrorDetail(err: unknown): string {
  if (err && typeof err === 'object') {
    const data = err as { stderr?: unknown; message?: unknown };
    const stderr = typeof data.stderr === 'string' ? data.stderr.trim() : '';
    if (stderr) return stderr;
    if (typeof data.message === 'string') return data.message;
  }
  return String(err);
}

async function getPullRequestView(workspacePath: string, prNumber: number): Promise<PullRequestView> {
  const { stdout } = await execFileAsync(
    'gh',
    ['pr', 'view', String(prNumber), '--json', 'state,mergedAt'],
    { cwd: workspacePath, timeout: 15_000 },
  );
  return JSON.parse(stdout) as PullRequestView;
}

export async function closePullRequest(workspacePath: string, prNumber: number): Promise<void> {
  const current = await getPullRequestView(workspacePath, prNumber);
  if (current.mergedAt) {
    throw new Error(`PR #${prNumber} is already merged and cannot be cancelled.`);
  }
  if (current.state === 'CLOSED') {
    return;
  }

  for (const args of [
    ['pr', 'close', String(prNumber), '--delete-branch'],
    ['pr', 'close', String(prNumber)],
  ]) {
    try {
      await execFileAsync('gh', args, { cwd: workspacePath, timeout: 30_000 });
      return;
    } catch (err) {
      const detail = extractErrorDetail(err);
      if (/already closed/i.test(detail)) return;
      if (args.length === 4) continue;
      throw new Error(detail);
    }
  }
}

export async function deleteReviewCache(
  workspacePath: string,
  cardId: string,
  reviewFilePath?: string,
): Promise<string[]> {
  const cachePath = reviewFilePath
    ? path.resolve(workspacePath, reviewFilePath)
    : path.join(workspacePath, '.sero', 'apps', 'kanban', 'reviews', `card-${cardId}.json`);

  try {
    await fs.rm(cachePath, { force: true });
    return [];
  } catch (err) {
    return [`Review cache cleanup failed for ${cachePath}: ${extractErrorDetail(err)}`];
  }
}
