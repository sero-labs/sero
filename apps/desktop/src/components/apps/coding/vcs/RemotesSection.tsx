/**
 * RemotesSection — manage Git remotes for the workspace.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Globe, Plus, Trash2, Check, X } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import { useVcsStore } from '@/stores/vcs';
import type { Remote } from '@/types/vcs';
import { VcsSection } from './VcsSection';

interface Props {
  workspaceId: string;
  remotes: Remote[];
}

export function RemotesSection({ workspaceId, remotes }: Props) {
  const store = useVcsStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('origin');
  const [url, setUrl] = useState('');

  const handleAdd = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    try {
      await store.addRemote(workspaceId, name.trim(), url.trim());
      setName('origin');
      setUrl('');
      setShowAdd(false);
    } catch (err) {
      store.setError(workspaceId, err instanceof Error ? err.message : 'Failed to add remote');
    }
  }, [workspaceId, name, url, store]);

  return (
    <VcsSection
      title="Remotes"
      count={remotes.length}
      defaultOpen={false}
      actions={
        <button
          onClick={() => setShowAdd((v) => !v)}
          title="Add remote"
          className={cn(
            'flex size-5 items-center justify-center rounded text-[var(--text-muted)]',
            'transition-colors duration-100 hover:bg-[var(--bg-muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          <Plus className="size-3" />
        </button>
      }
    >
      <div className="pb-1.5">
        {/* Add remote form */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="space-y-1.5 px-3 py-2 border-b border-[var(--border-subtle)]/30">
                <div className="flex items-center gap-1.5">
                  <label className="w-10 text-[10px] text-[var(--text-muted)]">Name</label>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
                      'px-1.5 text-[11px] text-[var(--text-primary)]',
                      'outline-none focus:border-[var(--border-focus)]',
                    )}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="w-10 text-[10px] text-[var(--text-muted)]">URL</label>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                    placeholder="git@github.com:user/repo.git"
                    className={cn(
                      'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
                      'px-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/30',
                      'outline-none focus:border-[var(--border-focus)]',
                    )}
                  />
                </div>
                <div className="flex justify-end gap-1">
                  <button
                    onClick={handleAdd}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium',
                      'bg-[var(--status-success-muted)] text-[var(--status-success)] hover:bg-[var(--status-success-subtle)]',
                      'transition-colors',
                    )}
                  >
                    <Check className="size-3" /> Add
                  </button>
                  <button
                    onClick={() => setShowAdd(false)}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                  >
                    <X className="size-3" /> Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Remote list */}
        {remotes.length === 0 && !showAdd ? (
          <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]/60">
            No remotes configured
          </div>
        ) : (
          remotes.map((remote, i) => (
            <motion.div
              key={remote.name}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12, delay: i * 0.03 }}
              className={cn(
                'group flex items-center gap-2 px-3 py-1',
                'transition-colors duration-100 hover:bg-[var(--bg-elevated)]/60',
              )}
            >
              <Globe className="size-3 shrink-0 text-[var(--text-muted)]/60" />
              <span className="shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">
                {remote.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-muted)]/40">
                {remote.url}
              </span>
              <button
                onClick={() => void store.removeRemote(workspaceId, remote.name)}
                title="Remove remote"
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--status-error)]"
              >
                <Trash2 className="size-2.5" />
              </button>
            </motion.div>
          ))
        )}
      </div>
    </VcsSection>
  );
}
