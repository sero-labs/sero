import { memo } from 'react';
import { PlugZap } from 'lucide-react';
import { useAppInfo } from '@sero-ai/app-runtime';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { useAttachedFolders } from '../hooks/useAttachedFolders';
import { usePluginDevSessions } from '../hooks/usePluginDevSessions';
import { usePlugins } from '../hooks/usePlugins';
import { AttachedFoldersSection } from './plugins/AttachedFoldersSection';
import { InstalledPluginsSection } from './plugins/InstalledPluginsSection';
import { LocalPluginDevelopmentSection } from './plugins/LocalPluginDevelopmentSection';

export const PluginsPanel = memo(function PluginsPanel() {
  const { workspaceId } = useAppInfo();
  const installed = usePlugins();
  const devSessions = usePluginDevSessions();
  const attached = useAttachedFolders(workspaceId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[var(--banner-primary)]">
              <PlugZap className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Plugins</h2>
              <p className="max-w-3xl text-[11px] leading-5 text-[var(--text-muted)]">
                Manage packaged plugin installs, local plugin development sessions for this profile,
                and Attached folders when you want local source trees visible in Explorer without
                changing plugin activation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] text-[10px] text-[var(--banner-primary)]"
            >
              {installed.plugins.length} installed
            </Badge>
            <Badge
              variant="outline"
              className="border-[var(--status-info-border)] bg-[var(--status-info-muted)] text-[10px] text-[var(--status-info)]"
            >
              {devSessions.sessions.length} local sessions
            </Badge>
            <Badge
              variant="outline"
              className="border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[10px] text-[var(--collab-primary)]"
            >
              {attached.attachedFolders.length} attached folders
            </Badge>
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
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
            onStart={() => devSessions.startDevSession()}
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
    </div>
  );
});
