import path from 'node:path';

import type { CommitNode, RefLabel } from '@sero-ai/common';
import { git, nonEmpty } from './git-command-support';

const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%D';
const LOG_SEP = '\x00';
const RECORD_SEP = '\x01';
const HISTORY_REF_GLOBS = ['--branches', '--remotes', '--tags'] as const;
const VISIBLE_HISTORY_REFS = ['HEAD', ...HISTORY_REF_GLOBS] as const;

function hasHeadCommit(cwd: string): boolean {
  return git(['rev-parse', '--verify', 'HEAD'], cwd).length > 0;
}

function visibleHistoryRefs(cwd: string): string[] {
  return hasHeadCommit(cwd) ? [...VISIBLE_HISTORY_REFS] : [...HISTORY_REF_GLOBS];
}

export function getCommits(cwd: string, max = 150): CommitNode[] {
  const raw = git([
    'log',
    '--topo-order',
    `--max-count=${max}`,
    `--format=${RECORD_SEP}${LOG_FORMAT}`,
    ...visibleHistoryRefs(cwd),
  ], cwd);
  if (!raw) return [];

  return raw
    .split(RECORD_SEP)
    .filter(nonEmpty)
    .map((record) => {
      const fields = record.split(LOG_SEP);
      const refs = parseRefs(fields[7] ?? '');
      return {
        hash: fields[0] ?? '',
        shortHash: fields[1] ?? '',
        parents: (fields[2] ?? '').split(' ').filter(nonEmpty),
        authorName: fields[3] ?? '',
        authorEmail: fields[4] ?? '',
        authorDate: fields[5] ?? '',
        subject: fields[6] ?? '',
        refs,
      };
    });
}

function parseRefs(raw: string): RefLabel[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((ref) => ref.trim())
    .filter(nonEmpty)
    .map((ref) => {
      if (ref.startsWith('HEAD -> ')) {
        return { name: ref.replace('HEAD -> ', ''), type: 'head' as const };
      }
      if (ref.startsWith('tag: ')) {
        return { name: ref.replace('tag: ', ''), type: 'tag' as const };
      }
      if (ref.includes('/')) {
        return { name: ref, type: 'remote' as const };
      }
      return { name: ref, type: 'local' as const };
    });
}

export function getCurrentBranch(cwd: string): string {
  return git(['symbolic-ref', '--short', 'HEAD'], cwd) || git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || 'HEAD';
}

export function getHeadHash(cwd: string): string {
  if (!hasHeadCommit(cwd)) return '';
  return git(['rev-parse', '--short', 'HEAD'], cwd) || '';
}

export function getRepoName(cwd: string): string {
  const topLevel = git(['rev-parse', '--show-toplevel'], cwd);
  return topLevel ? path.basename(topLevel) : path.basename(cwd);
}

export function isGitRepo(cwd: string): boolean {
  return git(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';
}

export function getCommitCount(cwd: string): number {
  const raw = git(['rev-list', '--count', ...visibleHistoryRefs(cwd)], cwd);
  return parseInt(raw, 10) || 0;
}
