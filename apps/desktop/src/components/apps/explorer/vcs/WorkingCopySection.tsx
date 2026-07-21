/**
 * WorkingCopySection, shows modified/added/deleted files in the working copy.
 */

import { memo, useCallback, useState } from 'react';
import { motion } from 'motion/react';
import { PlusCircle } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useVcsStore } from '@/stores/vcs';
import type { WorkingCopyStatus } from '@sero-ai/common';
import { WORKING_TREE_REV } from '@sero-ai/common';
import { VcsSection } from './VcsSection';
import { statusCode, statusColor } from './vcs-utils';

interface Props {
  workspaceId: string;
  status: WorkingCopyStatus | null;
  currentSha: string | null;
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}

export function WorkingCopySection({ workspaceId, status, currentSha, onOpenDiff }: Props) {
  const createCheckpoint = useVcsStore((s) => s.createCheckpoint);
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fileCount = status?.files.length ?? 0;
  const hasChanges = fileCount > 0;

  const handleCheckpoint = useCallback(async () => {
    setCreating(true);
    try {
      await createCheckpoint(workspaceId, desc || undefined, 'manual');
      setDesc('');
    } finally {
      setCreating(false);
    }
  }, [workspaceId, desc, createCheckpoint]);

  return (
    <VcsSection
      title="Working Copy"
      count={fileCount}
      badge={
        currentSha ? (
          <span className="ml-1 font-mono text-sm text-[var(--text-muted)]/60">
            @{currentSha.slice(0, 8)}
          </span>
        ) : null
      }
    >
      <div className="px-2 pb-2">
        {/* File list */}
        {hasChanges ? (
          <WorkingCopyFileList
            status={status!}
            currentSha={currentSha}
            onOpenDiff={onOpenDiff}
          />
        ) : (
          <div className="px-2 py-1.5 text-sm text-[var(--text-muted)]/60">
            No working copy changes
          </div>
        )}

        {/* Checkpoint bar */}
        <div className="flex items-center gap-1.5">
          <input aria-label="Commit description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleCheckpoint();
              }
            }}
            placeholder="Description (optional)"
            className={cn(
              'h-6 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
              'px-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40',
              'outline-none transition-colors focus:border-[var(--border-focus)]',
            )}
          />
          <button type="button"
            onClick={handleCheckpoint}
            disabled={creating}
            title="Create commit"
            className={cn(
              'flex h-6 items-center gap-1 rounded px-2 text-sm font-medium',
              'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              'transition-all duration-150',
              'hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]',
              'disabled:opacity-40',
            )}
          >
            <PlusCircle className="size-3" />
            <span className="hidden sm:inline">Commit</span>
          </button>
        </div>
      </div>
    </VcsSection>
  );
}

const WorkingCopyFileList = memo(function WorkingCopyFileList({
  status,
  currentSha,
  onOpenDiff,
}: {
  status: WorkingCopyStatus;
  currentSha: string | null;
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}) {
  return (
    <div className="mb-2 space-y-px">
      {status.files.map((file, index) => (
        <motion.button
          key={file.path}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.12, delay: index * 0.02 }}
          onClick={() => {
            if (currentSha && onOpenDiff) {
              onOpenDiff(currentSha, WORKING_TREE_REV, file.path);
            }
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-0.5 text-left',
            'transition-colors duration-100',
            'hover:bg-[var(--bg-elevated)]/80',
          )}
        >
          <span className={cn('w-3 shrink-0 text-center text-sm font-bold', statusColor(file.status))}>
            {statusCode(file.status)}
          </span>
          <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">
            {file.path}
          </span>
        </motion.button>
      ))}
    </div>
  );
});
