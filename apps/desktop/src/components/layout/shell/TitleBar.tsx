import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useActiveWorkspace } from '@/stores/workspace';
import { ProfileSwitcher } from '@/components/profiles/ProfileSwitcher';
import { GitTitleBarControls } from '@/components/layout/titlebar/git/GitTitleBarControls';
import { UpdateIndicator } from '@/components/layout/shell/UpdateIndicator';

/**
 * TitleBar — macOS-style custom title bar.
 *
 * The entire bar is a drag region. Interactive elements opt out with `no-drag`.
 * Left: traffic-light spacer → sidebar toggle → active app name.
 * Right: placeholder for global actions.
 */
export function TitleBar() {
  const toggleSidebar = useAppStore((s) => s.toggleMainSidebar);
  const toggleChat = useAppStore((s) => s.toggleChatPanel);
  const activeApp = useAppStore((s) => s.activeApp);
  const activeWorkspace = useActiveWorkspace();

  const appsList = useAppStore((s) => s.apps);
  const appLabel = appsList.find((a: { id: string; label: string }) => a.id === activeApp)?.label ?? 'Sero';
  const titleText = activeWorkspace?.name ? `${appLabel} — ${activeWorkspace.name}` : appLabel;

  return (
    <header className="title-bar drag-region flex h-10 shrink-0 items-center border-b border-[var(--border-default)] bg-[var(--bg-base)]">
      {/* ── Traffic-light spacer (macOS) ─────────────────────── */}
      <div className="flex w-[78px] shrink-0" />

      {/* ── Sidebar toggle + app title ───────────────────────── */}
      <div className="no-drag flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <PanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
        </Tooltip>

        <span className="truncate text-xs font-medium text-[var(--text-secondary)]" style={{ maxWidth: '50vw' }}>
          {titleText}
        </span>
      </div>

      {/* ── Spacer (draggable) ────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Right-side actions ────────────────────────────────── */}
      <div className="no-drag flex shrink-0 items-center gap-2 pr-3">
        <UpdateIndicator />

        <GitTitleBarControls />

        <ProfileSwitcher />

        <div className="mx-1 h-4 w-px bg-[var(--border-default)]" />

        <span className="text-sm text-[var(--text-muted)]">⌘K</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={toggleChat}
              aria-label="Toggle agent"
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <PanelRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle agent</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
