/**
 * File status is one 6px dot (design rule 18) — amber modified, green added,
 * red deleted, blue new. One table, because every surface that lists files
 * must colour them identically.
 */

import type { FileChangeStatus } from '../../shared/types';

const STATUS_COLOUR: Record<FileChangeStatus, string> = {
  added: 'var(--status-success)',
  modified: 'var(--status-warning)',
  deleted: 'var(--status-error)',
  renamed: 'var(--status-info)',
  copied: 'var(--status-info)',
  untracked: 'var(--status-info)',
  conflict: 'var(--status-error)',
};

export function statusColour(status: string): string {
  return STATUS_COLOUR[status as FileChangeStatus] ?? 'var(--text-muted)';
}
