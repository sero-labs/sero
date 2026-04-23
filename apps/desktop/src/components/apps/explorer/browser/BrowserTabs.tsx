import { Plus, X, Globe } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useBrowserStore } from '@/stores/browser';

export function BrowserTabs() {
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const setActive = useBrowserStore((s) => s.setActive);
  const closeTab = useBrowserStore((s) => s.closeTab);
  const createTab = useBrowserStore((s) => s.createTab);

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActive(tab.id)}
          className={cn(
            'group flex h-6 max-w-[200px] items-center gap-1.5 rounded px-2 text-xs transition-colors',
            activeTabId === tab.id
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
          )}
          title={tab.title}
        >
          {tab.favicon ? (
            <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-sm" />
          ) : (
            <Globe className="size-3 shrink-0 opacity-60" />
          )}
          <span className="truncate">{tab.isLoading ? 'Loading…' : tab.title}</span>
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
      <button
        onClick={() => createTab()}
        className="flex h-6 items-center rounded px-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        title="New tab (⌘N)"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
