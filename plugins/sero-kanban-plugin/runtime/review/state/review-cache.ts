import path from 'path';
import { promises as fs } from 'fs';
import type { ReviewResult } from '../../prompts';
import { getBlockingReviewFailure, hasMalformedLegacyIssues } from './review-result-utils';

export async function loadCachedReview(filePath: string): Promise<ReviewResult | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as Partial<ReviewResult>;
    if (
      typeof data.prTitle === 'string'
      && typeof data.prBody === 'string'
      && !hasMalformedLegacyIssues(data)
    ) {
      const review = data as ReviewResult;
      return getBlockingReviewFailure(review) ? null : review;
    }
  } catch {
    // No cached review or invalid file — run from scratch.
  }
  return null;
}

export async function saveCachedReview(filePath: string, review: ReviewResult): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(review, null, 2), 'utf8');
}

export async function deleteCachedReview(filePath: string): Promise<void> {
  try {
    await fs.rm(filePath, { force: true });
  } catch (error) {
    console.warn(`[kanban-runtime] failed to delete cached review at ${filePath}:`, error);
  }
}
