/**
 * Title bar — `h-10`, matching the desktop `TitleBar`.
 *
 * Layout: wordmark → sidebar toggle → breadcrumb → right cluster.
 * The right cluster carries the panel toggles on mobile, where the
 * activity rail is not rendered, and the theme control, which lives in
 * the status bar on desktop.
 */

import seroLogoLightUrl from '@assets/logo.svg';
import seroLogoDarkUrl from '@assets/logo-dark.svg';
import {
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Menu,
  Monitor,
  PanelLeft,
} from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { RightPanel } from '@/stores/layout';
import { useWorkspaceStore } from '@/stores/workspace';
import { ThemeModeButton } from './ThemeModeButton';

const MOBILE_PANELS: Array<{ id: RightPanel; label: string; icon: typeof FileText }> = [
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'artifacts', label: 'Artifacts', icon: ImageIcon },
  { id: 'preview', label: 'Dev server preview', icon: Monitor },
];

interface TitleBarProps {
  isMobile: boolean;
  hasRunningDevServers: boolean;
  /** The open right panel in the current mode, or null. */
  rightPanel: RightPanel | null;
  onToggleSidebar: () => void;
  onTogglePanel: (panel: RightPanel) => void;
}

export function TitleBar({
  isMobile,
  hasRunningDevServers,
  rightPanel,
  onToggleSidebar,
  onTogglePanel,
}: TitleBarProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border-default)] bg-[var(--bg-base)] px-2">
      <SeroLogo />

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        {isMobile ? <Menu className="size-4" /> : <PanelLeft className="size-4" />}
      </Button>

      <Breadcrumb isMobile={isMobile} />

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-0.5">
        {isMobile && (
          <>
            {MOBILE_PANELS.map((panel) => (
              <Button
                key={panel.id}
                variant={rightPanel === panel.id ? 'secondary' : 'ghost'}
                size="icon-xs"
                title={panel.label}
                aria-label={panel.label}
                onClick={() => onTogglePanel(panel.id)}
                className={cn(
                  panel.id === 'preview' && hasRunningDevServers && 'text-status-success',
                )}
              >
                <panel.icon className="size-4" />
              </Button>
            ))}
            <ThemeModeButton />
          </>
        )}
      </div>
    </header>
  );
}

/** `Workspace › Session`. The workspace is dropped on narrow screens. */
function Breadcrumb({ isMobile }: { isMobile: boolean }) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace);

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const session = activeWorkspaceId
    ? (sessionsByWorkspace[activeWorkspaceId] ?? []).find((s) => s.id === activeSessionId)
    : undefined;
  const sessionTitle = session?.name || session?.firstMessage;

  if (!workspace) return null;

  return (
    <div className="flex min-w-0 items-center gap-1 text-sm text-[var(--text-secondary)]">
      {!isMobile && <span className="truncate">{workspace.name}</span>}
      {sessionTitle && (
        <>
          {!isMobile && <ChevronRight className="size-3 shrink-0 text-[var(--text-muted)]" />}
          <span className="truncate text-[var(--text-primary)]">{sessionTitle}</span>
        </>
      )}
    </div>
  );
}

/**
 * Theme-aware wordmark. `logo.svg` is dark ink for light backgrounds,
 * `logo-dark.svg` is light ink for dark backgrounds. The swap is pure
 * CSS so it never lags the `.dark` class.
 */
function SeroLogo() {
  return (
    <>
      <img src={seroLogoLightUrl} alt="Sero" className="h-5 w-auto dark:hidden" />
      <img
        src={seroLogoDarkUrl}
        alt=""
        aria-hidden="true"
        className="hidden h-5 w-auto dark:block"
      />
    </>
  );
}
