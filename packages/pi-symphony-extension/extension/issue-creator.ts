/**
 * Issue creator — writes issue files to the file tracker's active folder.
 *
 * Called by the extension when pendingIssueCreates appear in state.
 */

import { promises as fs, mkdirSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { PendingIssueCreate, SymphonyConfig } from '../shared/types';
import { info, warn } from './logger';

/** Slugify a title for use as a filename. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';
}

/** Serialize a PendingIssueCreate into markdown with YAML front matter. */
function serializeIssue(issue: PendingIssueCreate): string {
  const frontMatter: Record<string, unknown> = {
    id: issue.id,
    title: issue.title,
  };
  if (issue.priority != null) frontMatter.priority = issue.priority;
  if (issue.labels.length > 0) frontMatter.labels = issue.labels;

  const yamlStr = yaml.dump(frontMatter, { lineWidth: -1 }).trim();
  return `---\n${yamlStr}\n---\n\n${issue.description}\n`;
}

/** Resolve the active directory for a file tracker config. Returns null if not file-based. */
export function resolveActiveDir(config: SymphonyConfig): string | null {
  if (config.tracker.kind !== 'file') return null;
  const activeState = config.tracker.active_states[0] ?? 'active';
  return path.join(config.tracker.issues_dir, activeState);
}

/** Write a single issue file to the active directory. */
export async function writeIssueFile(
  issue: PendingIssueCreate,
  activeDir: string,
): Promise<string> {
  mkdirSync(activeDir, { recursive: true });

  const slug = slugify(issue.title);
  let filename = `${slug}.md`;
  let filePath = path.join(activeDir, filename);

  // Avoid collisions
  let attempt = 0;
  while (true) {
    try {
      await fs.access(filePath);
      // File exists — append suffix
      attempt++;
      filename = `${slug}-${attempt}.md`;
      filePath = path.join(activeDir, filename);
    } catch {
      break; // File doesn't exist — use this path
    }
  }

  const content = serializeIssue(issue);
  await fs.writeFile(filePath, content, 'utf8');
  info('issue-creator:wrote', { filename, activeDir });
  return filePath;
}

/** Process all pending issue creates. Returns IDs of successfully created issues. */
export async function processPendingCreates(
  pending: PendingIssueCreate[],
  config: SymphonyConfig,
): Promise<string[]> {
  const activeDir = resolveActiveDir(config);
  if (!activeDir) {
    warn('issue-creator:not-file-tracker', {});
    return [];
  }

  const created: string[] = [];

  for (const issue of pending) {
    try {
      await writeIssueFile(issue, activeDir);
      created.push(issue.id);
    } catch (err) {
      warn('issue-creator:write-failed', {
        id: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return created;
}
