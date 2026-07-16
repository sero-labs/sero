/**
 * RemotesSection, manage Git remotes for the workspace.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Globe, Plus, Trash2, Check, X } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useVcsStore } from '@/stores/vcs';
import type { Remote } from '@sero-ai/common';
import { VcsSection } from './VcsSection';

interface Props {
  workspaceId: string;
  remotes: Remote[];
}

export function RemotesSection({ workspaceId, remotes }: Props) {
  const addRemote = useVcsStore((state) => state.addRemote);
  const removeRemote = useVcsStore((state) => state.removeRemote);
  const setError = useVcsStore((state) => state.setError);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('origin');
  const [url, setUrl] = useState('');

  const handleAdd = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    try {
      await addRemote(workspaceId, name.trim(), url.trim());
      setName('origin');
      setUrl('');
      setShowAdd(false);
    } catch (err) {
      setError(workspaceId, err instanceof Error ? err.message : 'Failed to add remote');
    }
  }, [addRemote, name, setError, url, workspaceId]);

  return (
    <VcsSection
      title="Remotes"
      count={remotes.length}
      defaultOpen={false}
      actions={
        <button type="button"
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
                  <label htmlFor="remote-name-input" className="w-10 text-sm text-[var(--text-muted)]">Name</label>
                  <input
                    id="remote-name-input"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
                      'px-1.5 text-sm text-[var(--text-primary)]',
                      'outline-none focus:border-[var(--border-focus)]',
                    )}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="remote-url-input" className="w-10 text-sm text-[var(--text-muted)]">URL</label>
                  <input
                    id="remote-url-input"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                    placeholder="git@github.com:user/repo.git"
                    className={cn(
                      'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
                      'px-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/30',
                      'outline-none focus:border-[var(--border-focus)]',
                    )}
                  />
                </div>
                <div className="flex justify-end gap-1">
                  <button type="button"
                    onClick={handleAdd}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium',
                      'bg-status-success-muted text-status-success hover:bg-status-success-subtle',
                      'transition-colors',
                    )}
                  >
                    <Check className="size-3" /> Add
                  </button>
                  <button type="button"
                    onClick={() => setShowAdd(false)}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
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
          <div className="px-3 py-1.5 text-sm text-[var(--text-muted)]/60">
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
              <span className="shrink-0 text-sm font-medium text-[var(--text-secondary)]">
                {remote.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]/40">
                {remote.url}
              </span>
              <button type="button"
                onClick={() => void removeRemote(workspaceId, remote.name)}
                title="Remove remote"
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-[var(--text-muted)] hover:text-status-error"
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
