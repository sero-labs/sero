/**
 * TerminalTabs — tab bar for multiple terminal sessions per workspace.
 *
 * Shows terminal tabs with close buttons and a "+" button to create new ones.
 * Connected to the terminal store for state management.
 */

import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import {
  useWorkspaceTerminals,
  useActiveTerminalId,
  useTerminalStore,
} from '@/stores/terminal';
import { useWorkspaceContainer } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@sero-ai/ui/lib/utils';

interface TerminalTabsProps {
  workspaceId: string;
}

export function TerminalTabs({ workspaceId }: TerminalTabsProps) {
  const tabs = useWorkspaceTerminals(workspaceId);
  const activeId = useActiveTerminalId(workspaceId);
  const setActive = useTerminalStore((s) => s.setActive);
  const createTab = useTerminalStore((s) => s.createTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const container = useWorkspaceContainer(workspaceId);
  const isContainerWorkspace = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === workspaceId)?.container ?? true,
  );

  // Non-container workspaces can always create terminals;
  // container workspaces require the container to be running.
  const canCreateTerminal = isContainerWorkspace
    ? container.status === 'running'
    : true;

  const handleNewTerminal = async () => {
    if (!canCreateTerminal) return;
    try {
      await createTab(workspaceId);
    } catch (err) {
      console.error('[terminal] Failed to create terminal:', err);
    }
  };

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-1">
      {/* Tabs */}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActive(workspaceId, tab.id)}
          className={cn(
            'group flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors',
            activeId === tab.id
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
            tab.exited && 'opacity-50',
          )}
        >
          <span className="max-w-[100px] truncate">{tab.title}</span>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                closeTab(tab.id);
              }
            }}
            className="rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--bg-base)] group-hover:opacity-100"
          >
            <X className="size-2.5" />
          </span>
        </button>
      ))}

      {/* New terminal button */}
      <button
        onClick={handleNewTerminal}
        disabled={!canCreateTerminal}
        className={cn(
          'flex h-6 items-center rounded px-1.5 text-[var(--text-muted)] transition-colors',
          canCreateTerminal
            ? 'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]'
            : 'cursor-not-allowed opacity-30',
        )}
        title={canCreateTerminal ? 'New terminal' : 'Container not running'}
      >
        <Plus className="size-3" />
      </button>

      {/* Container IP indicator */}
      {container.status === 'running' && container.ipAddress && (
        <span className="ml-auto px-2 text-xs text-[var(--text-muted)]">
          {container.ipAddress}
        </span>
      )}
    </div>
  );
}
