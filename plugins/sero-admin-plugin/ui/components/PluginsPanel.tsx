import { memo, useCallback } from 'react';
import { useAppInfo } from '@sero-ai/app-runtime';
import { PluginSafetyDisclaimer } from '@sero-ai/ui/components/ui/plugin-safety-disclaimer';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { useAttachedFolders } from '../hooks/useAttachedFolders';
import { usePluginDevSessions } from '../hooks/usePluginDevSessions';
import { usePlugins } from '../hooks/usePlugins';
import { AttachedFoldersSection } from './plugins/AttachedFoldersSection';
import { InstalledPluginsSection } from './plugins/InstalledPluginsSection';
import { LocalPluginDevelopmentSection } from './plugins/LocalPluginDevelopmentSection';

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export const PluginsPanel = memo(function PluginsPanel() {
  const { workspaceId } = useAppInfo();
  const installed = usePlugins();
  const devSessions = usePluginDevSessions();
  const attached = useAttachedFolders(workspaceId);
  const handleStartDevSession = useCallback(() => devSessions.startDevSession(), [devSessions.startDevSession]);

  const summary = [
    `${installed.plugins.length} installed`,
    plural(devSessions.sessions.length, 'local session'),
    plural(attached.attachedFolders.length, 'attached folder'),
  ].join(' · ');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/30 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Plugins</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground/70">
            Manage packaged installs, local development sessions, and folders attached for Explorer
            visibility.
          </p>
        </div>
        <span className="mt-1 shrink-0 text-xs text-muted-foreground/70">{summary}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        <div className="@container flex min-w-0 flex-col gap-4 p-4">
          <InstalledPluginsSection
            plugins={installed.plugins}
            loading={installed.loading}
            error={installed.error}
            installing={installed.installing}
            uninstallingIds={installed.uninstallingIds}
            onInstall={installed.install}
            onUninstall={installed.uninstall}
            onReveal={installed.revealInFinder}
          />

          <LocalPluginDevelopmentSection
            sessions={devSessions.sessions}
            loading={devSessions.loading}
            error={devSessions.error}
            starting={devSessions.starting}
            refreshingIds={devSessions.refreshingIds}
            stoppingIds={devSessions.stoppingIds}
            onStart={handleStartDevSession}
            onRefresh={devSessions.refreshDevSession}
            onStop={devSessions.stopDevSession}
            onReveal={devSessions.revealInFinder}
          />

          <AttachedFoldersSection
            workspaceId={workspaceId}
            folders={attached.attachedFolders}
            loading={attached.loading}
            busy={attached.busy}
            error={attached.error}
            onAttach={attached.attachFolder}
            onDetach={attached.detachFolder}
            onReveal={attached.revealInFinder}
          />
        </div>
      </ScrollArea>

      <PluginSafetyDisclaimer />
    </div>
  );
});
