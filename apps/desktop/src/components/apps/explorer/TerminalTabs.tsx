/**
 * TerminalTabs — tab bar for multiple terminal sessions per workspace.
 *
 * Shows terminal tabs with close buttons and a "+" button to create new ones.
 * Connected to the terminal store for state management.
 */

import { Plus, X } from 'lucide-react';
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
  const showHostFallbackNotice = isContainerWorkspace && container.status !== 'running';

  const handleNewTerminal = async () => {
    try {
      await createTab(workspaceId);
    } catch (err) {
      console.error('[terminal] Failed to create terminal:', err);
    }
  };

  return (
    <div className="flex min-h-8 shrink-0 flex-col border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
      {showHostFallbackNotice && (
        <div className="border-b border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] px-2 py-1 text-[11px] text-[var(--status-warning-text)]">
          Containers are unavailable for this workspace right now. New terminals will open on your Mac until the workspace container is back.
        </div>
      )}
      <div className="flex h-8 items-center gap-0.5 px-1">
        {/* Tabs */}
        {tabs.map((tab) => (
          <button type="button"
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
            {tab.runtime === 'host' && (
              <span
                title={tab.fallbackReason}
                className="rounded bg-[var(--status-warning-faint)] px-1 py-0.5 text-[10px] font-medium text-[var(--status-warning-text)]"
              >
                Host
              </span>
            )}
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
        <button type="button"
          onClick={handleNewTerminal}
          className={cn(
            'flex h-6 items-center rounded px-1.5 text-[var(--text-muted)] transition-colors',
            'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
          )}
          title={showHostFallbackNotice ? 'New host terminal' : 'New terminal'}
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
    </div>
  );
}
