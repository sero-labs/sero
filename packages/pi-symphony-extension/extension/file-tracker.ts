/**
 * File-based tracker implementation.
 *
 * Watches a local folder of structured issue files (YAML front matter
 * + Markdown body), enabling tracker-free or self-hosted workflows.
 *
 * Folder structure:
 *   <issues_dir>/active/   — Issues eligible for dispatch
 *   <issues_dir>/done/     — Terminal: completed successfully
 *   <issues_dir>/failed/   — Terminal: agent gave up
 *   <issues_dir>/paused/   — Not active, not terminal
 *
 * State transitions = moving files between subfolders.
 */

import { promises as fs, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Issue, TrackerConfig } from '../shared/types';
import type { IssueTracker } from './tracker';
import { info, warn } from './logger';

type FileConfig = Extract<TrackerConfig, { kind: 'file' }>;

// ── Issue file parser ──────────────────────────────────────────

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

interface IssueFrontMatter {
  id?: string;
  title?: string;
  priority?: number;
  labels?: string[];
  branch?: string;
  blocked_by?: Array<string | { id?: string; identifier?: string; state?: string }>;
}

function parseIssueFile(filePath: string, content: string, state: string): Issue | null {
  const basename = path.basename(filePath, '.md');
  const match = FRONT_MATTER_RE.exec(content);

  let frontMatter: IssueFrontMatter = {};
  let description = content.trim();

  if (match) {
    try {
      frontMatter = (yaml.load(match[1]) as IssueFrontMatter) ?? {};
    } catch {
      warn('file-tracker:yaml-parse-error', { file: filePath });
      return null;
    }
    description = (match[2] ?? '').trim() || null as string | null;
  }

  const blockedBy = (frontMatter.blocked_by ?? []).map((b) => {
    if (typeof b === 'string') {
      return { id: null, identifier: b, state: null };
    }
    return {
      id: b.id ?? null,
      identifier: b.identifier ?? null,
      state: b.state ?? null,
    };
  });

  return {
    id: frontMatter.id ?? basename,
    identifier: basename,
    title: frontMatter.title ?? basename,
    description,
    priority: frontMatter.priority ?? null,
    state,
    branchName: frontMatter.branch ?? null,
    url: null,
    labels: (frontMatter.labels ?? []).map((l) => String(l).toLowerCase()),
    blockedBy,
    createdAt: null,
    updatedAt: null,
  };
}

// ── File tracker ───────────────────────────────────────────────

export class FileTracker implements IssueTracker {
  readonly kind = 'file' as const;
  private config: FileConfig;

  constructor(config: FileConfig) {
    this.config = config;
    this.ensureDirectories();
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const issues: Issue[] = [];

    for (const activeState of this.config.active_states) {
      const dir = path.join(this.config.issues_dir, activeState);
      const files = await this.listMdFiles(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const issue = parseIssueFile(filePath, content, activeState);
          if (issue) issues.push(issue);
        } catch (err) {
          warn('file-tracker:read-error', {
            file: filePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    info('file-tracker:fetch-candidates', { count: issues.length });
    return issues;
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const allStates = [
      ...this.config.active_states,
      ...this.config.terminal_states,
      'paused',
    ];

    for (const state of allStates) {
      const dir = path.join(this.config.issues_dir, state);
      const files = await this.listMdFiles(dir);

      for (const file of files) {
        const basename = path.basename(file, '.md');
        // Check both by filename (identifier) and by reading front matter id
        if (ids.includes(basename)) {
          result.set(basename, state);
        } else {
          // Read front matter to check id field
          try {
            const content = await fs.readFile(path.join(dir, file), 'utf8');
            const match = FRONT_MATTER_RE.exec(content);
            if (match) {
              const fm = yaml.load(match[1]) as Record<string, unknown> | null;
              const fmId = fm?.id ? String(fm.id) : null;
              if (fmId && ids.includes(fmId)) {
                result.set(fmId, state);
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    return result;
  }

  async transitionIssue(issueId: string, toState: string): Promise<void> {
    const allStates = [
      ...this.config.active_states,
      ...this.config.terminal_states,
      'paused',
    ];

    for (const state of allStates) {
      const dir = path.join(this.config.issues_dir, state);
      const files = await this.listMdFiles(dir);

      for (const file of files) {
        const basename = path.basename(file, '.md');
        if (basename === issueId || await this.fileHasId(path.join(dir, file), issueId)) {
          const srcPath = path.join(dir, file);
          const destDir = path.join(this.config.issues_dir, toState);
          const destPath = path.join(destDir, file);

          try {
            mkdirSync(destDir, { recursive: true });
            renameSync(srcPath, destPath);
            info('file-tracker:transition', { issueId, from: state, to: toState });
          } catch (err) {
            warn('file-tracker:transition-failed', {
              issueId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
      }
    }

    warn('file-tracker:transition-not-found', { issueId, toState });
  }

  destroy(): void {
    // No watchers to clean up in this implementation
  }

  // ── Private helpers ────────────────────────────────────────

  private async listMdFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir);
      return entries.filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }
  }

  private async fileHasId(filePath: string, targetId: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const match = FRONT_MATTER_RE.exec(content);
      if (!match) return false;
      const fm = yaml.load(match[1]) as Record<string, unknown> | null;
      return fm?.id ? String(fm.id) === targetId : false;
    } catch {
      return false;
    }
  }

  private ensureDirectories(): void {
    const dirs = [
      ...this.config.active_states,
      ...this.config.terminal_states,
      'paused',
    ];

    for (const dir of dirs) {
      try {
        mkdirSync(path.join(this.config.issues_dir, dir), { recursive: true });
      } catch {
        // may already exist
      }
    }
  }
}
