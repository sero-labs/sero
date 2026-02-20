/**
 * ChangeDetail — expanded inline detail for a change log row.
 *
 * Shows file list with status indicators + action buttons.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  FileText,
  RotateCcw,
  Trash2,
  ArrowDownToLine,
  Pencil,
  Check,
  X,
  CloudUpload,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVcsStore, useWorkspaceVcs } from '@/stores/vcs';
import type { ChangeEntry, FileDiffEntry } from '@/types/vcs';
import { statusCode, statusColor, basename } from './vcs-utils';

interface Props {
  workspaceId: string;
  entry: ChangeEntry;
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}

export function ChangeDetail({ workspaceId, entry, onOpenDiff }: Props) {
  const store = useVcsStore();
  const ws = useWorkspaceVcs(workspaceId);
  const [files, setFiles] = useState<FileDiffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [descDraft, setDescDraft] = useState(entry.description);
  const [showPushAs, setShowPushAs] = useState(false);
  const [pushBranch, setPushBranch] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushNotice, setPushNotice] = useState<{ message: string; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.sero.vcs
      .fileDiffSummary(workspaceId, entry.changeId)
      .then((f) => { if (!cancelled) setFiles(f); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, entry.changeId]);

  const handleSaveDesc = useCallback(async () => {
    if (descDraft.trim() && descDraft !== entry.description) {
      await store.describe(workspaceId, entry.changeId, descDraft.trim());
    }
    setEditing(false);
  }, [workspaceId, entry.changeId, descDraft, entry.description, store]);

  const showPushNotice = useCallback((message: string, error = false) => {
    setPushNotice({ message, error });
    setTimeout(() => setPushNotice(null), 4000);
  }, []);

  const handlePush = useCallback(async () => {
    setPushing(true);
    try {
      const r = await store.push(workspaceId, ws?.activePushBookmark ?? undefined, entry.changeId);
      showPushNotice(r.message || (r.success ? 'Push complete' : 'Push failed'), !r.success);
    } catch (err) {
      showPushNotice(err instanceof Error ? err.message : 'Push failed', true);
    } finally {
      setPushing(false);
    }
  }, [workspaceId, entry.changeId, ws?.activePushBookmark, store, showPushNotice]);

  const handlePushAs = useCallback(async () => {
    const branch = pushBranch.trim().replace(/\s+/g, '-');
    if (!branch) return;

    setPushing(true);
    try {
      // Read fresh bookmarks from the store to avoid race with stale render snapshot
      const freshWs = useVcsStore.getState().byWorkspace[workspaceId];
      const existing = freshWs?.bookmarks.find((b) => b.name === branch);
      if (existing) {
        await store.moveBookmark(workspaceId, branch, entry.changeId);
      } else {
        await store.createBookmark(workspaceId, branch, entry.changeId);
      }

      const r = await store.push(workspaceId, branch, entry.changeId);
      showPushNotice(r.message || (r.success ? 'Push complete' : 'Push failed'), !r.success);
      if (r.success) {
        setShowPushAs(false);
        setPushBranch('');
      }
    } catch (err) {
      showPushNotice(err instanceof Error ? err.message : 'Push failed', true);
    } finally {
      setPushing(false);
    }
  }, [pushBranch, workspaceId, entry.changeId, store, showPushNotice]);

  return (
    <div className="border-t border-[var(--border-subtle)]/30 bg-[var(--bg-elevated)]/20 px-3 py-2">
      {/* Description (editable) */}
      <div className="mb-2 flex items-start gap-1.5">
        {editing ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveDesc();
                if (e.key === 'Escape') setEditing(false);
              }}
              className={cn(
                'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
                'px-1.5 text-[11px] text-[var(--text-primary)]',
                'outline-none focus:border-[var(--border-focus)]',
              )}
            />
            <button onClick={handleSaveDesc} className="text-emerald-500 hover:text-emerald-400">
              <Check className="size-3" />
            </button>
            <button onClick={() => setEditing(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <>
            <span className={cn(
              'flex-1 text-[11px]',
              entry.description === '(no description)' ? 'text-[var(--text-muted)]/40 italic' : 'text-[var(--text-secondary)]',
            )}>
              {entry.description}
            </span>
            {!entry.immutable && (
              <button
                onClick={() => { setDescDraft(entry.description === '(no description)' ? '' : entry.description); setEditing(true); }}
                title="Edit description"
                className="text-[var(--text-muted)]/40 hover:text-[var(--text-secondary)] transition-colors"
              >
                <Pencil className="size-2.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Meta */}
      <div className="mb-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]/50">
        <span>{entry.author || entry.email}</span>
        <span className="font-mono">{entry.commitId.slice(0, 8)}</span>
        {entry.empty && <span className="italic">empty</span>}
      </div>

      {/* File list */}
      {loading ? (
        <div className="py-1 text-[10px] text-[var(--text-muted)]/40">Loading files…</div>
      ) : files.length === 0 ? (
        <div className="py-1 text-[10px] text-[var(--text-muted)]/40">No file changes</div>
      ) : (
        <div className="mb-2 space-y-px">
          {files.map((f, i) => (
            <motion.button
              key={f.path}
              initial={{ opacity: 0, x: -3 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.08, delay: i * 0.02 }}
              onClick={() => onOpenDiff?.(entry.changeId + '-', entry.changeId, f.path)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-px text-left',
                'transition-colors duration-75 hover:bg-[var(--bg-elevated)]',
              )}
            >
              <span className={cn('w-3 shrink-0 text-center text-[10px] font-bold', statusColor(f.status))}>
                {statusCode(f.status)}
              </span>
              <FileText className="size-3 shrink-0 text-[var(--text-muted)]/30" />
              <span className="min-w-0 truncate text-[10px] text-[var(--text-secondary)]">
                {f.path}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1">
        <DetailAction
          icon={<FileText className="size-3" />}
          label="Diff"
          onClick={() => onOpenDiff?.(entry.changeId + '-', entry.changeId)}
        />
        {!entry.immutable && (
          <>
            <DetailAction
              icon={<RotateCcw className="size-3" />}
              label="Restore"
              onClick={() => void store.restoreCheckpoint(workspaceId, entry.changeId)}
            />
            <DetailAction
              icon={<ArrowDownToLine className="size-3" />}
              label="Squash"
              onClick={() => void store.abandon(workspaceId, entry.changeId)}
            />
            <DetailAction
              icon={<Trash2 className="size-3" />}
              label="Abandon"
              onClick={() => void store.abandon(workspaceId, entry.changeId)}
              danger
            />
            <DetailAction
              icon={<CloudUpload className="size-3" />}
              label="Push"
              onClick={() => void handlePush()}
              disabled={pushing}
            />
            <DetailAction
              icon={<GitBranch className="size-3" />}
              label="Push as…"
              onClick={() => setShowPushAs((v) => !v)}
              disabled={pushing}
            />
          </>
        )}
      </div>

      {showPushAs && (
        <div className="mt-2 flex items-center gap-1.5">
          <GitBranch className="size-3 shrink-0 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={pushBranch}
            onChange={(e) => setPushBranch(e.target.value.replace(/\s+/g, '-'))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handlePushAs();
              if (e.key === 'Escape') setShowPushAs(false);
            }}
            placeholder="feature/my-branch"
            className={cn(
              'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
              'px-1.5 text-[11px] text-[var(--text-primary)]',
              'outline-none focus:border-[var(--border-focus)]',
            )}
          />
          <button
            onClick={() => void handlePushAs()}
            disabled={pushing || !pushBranch.trim()}
            className="text-emerald-500 hover:text-emerald-400 disabled:opacity-40"
            title="Push to branch"
          >
            <Check className="size-3" />
          </button>
          <button
            onClick={() => setShowPushAs(false)}
            disabled={pushing}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-40"
            title="Cancel"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {pushNotice && (
        <div
          className={cn(
            'mt-2 rounded px-2 py-1 text-[10px]',
            pushNotice.error
              ? 'bg-red-500/10 text-red-300'
              : 'bg-emerald-500/10 text-emerald-300',
          )}
        >
          {pushNotice.message}
        </div>
      )}
    </div>
  );
}

function DetailAction({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
        'transition-colors duration-100',
        'disabled:opacity-40',
        danger
          ? 'text-[var(--text-muted)]/50 hover:bg-red-500/10 hover:text-red-400'
          : 'text-[var(--text-muted)]/50 hover:bg-[var(--bg-muted)] hover:text-[var(--text-secondary)]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
