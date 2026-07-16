import { memo } from 'react';
import { Dashboard } from '@/components/apps/dashboard/Dashboard';
import { SeroAppMount } from '@/components/apps/SeroAppMount';
import { useAppStore } from '@/stores/app';
import { ExplorerWorkspace } from './explorer/ExplorerWorkspace';

interface ActiveAppPanelProps {
  app: string;
}

/**
 * Renders the currently visible app. The store keeps `activeApp` pinned to
 * the previous value while a new federated module preloads in the background.
 */
export const ActiveAppPanel = memo(function ActiveAppPanel({ app }: ActiveAppPanelProps) {
  const pendingApp = useAppStore((s) => s.pendingApp);
  const apps = useAppStore((s) => s.apps);
  const entry = apps.find((candidate) => candidate.id === app);

  let content: React.ReactNode;

  if (app === 'dashboard') {
    content = <Dashboard />;
  } else if (app === 'explorer') {
    content = <ExplorerWorkspace />;
  } else if (entry?.manifest) {
    const manifestKey = [
      entry.manifest.id,
      entry.manifest.remoteEntryOverride ?? entry.manifest.uiEntry ?? 'builtin',
      entry.manifest.component ?? 'no-component',
    ].join(':');
    content = <SeroAppMount key={manifestKey} manifest={entry.manifest} />;
  } else {
    content = (
      <div className="flex h-full items-center justify-center bg-[var(--bg-base)]">
        <span className="text-base capitalize text-[var(--text-muted)]">
          {app} app, coming soon
        </span>
      </div>
    );
  }

  return (
    <div
      data-app-panel
      className="flex min-h-0 min-w-[500px] flex-1 flex-col overflow-hidden transition-opacity duration-150"
      style={{ opacity: pendingApp ? 0.7 : 1 }}
    >
      {content}
    </div>
  );
});
