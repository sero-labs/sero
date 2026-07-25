import { memo } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { ProfileSwitcher } from '@/components/profiles/ProfileSwitcher';
import { GitTitleBarControls } from '@/components/layout/titlebar/git/GitTitleBarControls';
import { NavButtons } from '@/components/layout/titlebar/NavButtons';
import { ShortcutChips } from '@/components/layout/titlebar/ShortcutChips';
import { TitleBarBreadcrumb } from '@/components/layout/titlebar/TitleBarBreadcrumb';
import { TitleBarContributions } from '@/components/layout/titlebar/TitleBarContributions';
import { WindowControls } from '@/components/layout/titlebar/WindowControls';
import { UpdateIndicator } from '@/components/layout/shell/UpdateIndicator';

/**
 * TitleBar — one custom chrome for every platform.
 *
 * The bar is a drag region; interactive clusters opt out with `no-drag`.
 * Only the window-control corner differs per platform: macOS native
 * traffic lights (left), Windows native overlay buttons (right), Linux
 * custom controls (right). `chrome-zoom-invariant` keeps the bar at a
 * constant physical size at every zoom level.
 *
 * Layout: window controls → sidebar toggle → back/forward → breadcrumb
 * → shortcut chips (center) → global actions → window controls.
 */

/** Width reserved for macOS traffic lights (trafficLightPosition x=12 + 3 lights). */
const MACOS_TRAFFIC_LIGHT_WIDTH = 78;

/** Width of the native Windows overlay buttons (3 × 46px). */
const WINDOWS_OVERLAY_WIDTH = 138;

export const TitleBar = memo(function TitleBar() {
  const toggleSidebar = useAppStore((s) => s.toggleMainSidebar);
  const toggleChat = useAppStore((s) => s.toggleChatPanel);
  const platform = window.sero.platform;

  // macOS and Windows handle drag-region double-click natively; the
  // frameless Linux window needs it wired up.
  const handleDoubleClick =
    platform === 'linux'
      ? (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest('.no-drag')) return;
          void window.sero.window.toggleMaximize();
        }
      : undefined;

  return (
    <header
      onDoubleClick={handleDoubleClick}
      className="title-bar drag-region chrome-zoom-invariant flex h-10 shrink-0 items-center border-b border-[var(--border-default)] bg-[var(--bg-base)]"
    >
      {/* ── Platform window-control area (left) ──────────────── */}
      {platform === 'darwin' ? (
        <div style={{ width: MACOS_TRAFFIC_LIGHT_WIDTH }} className="shrink-0" />
      ) : (
        <div className="w-2 shrink-0" />
      )}

      {/* ── Sidebar toggle + navigation + breadcrumb ─────────── */}
      <div className="no-drag flex items-center gap-0.5">
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
          <TooltipContent side="bottom" className="chrome-zoom-invariant">Toggle sidebar</TooltipContent>
        </Tooltip>

        <NavButtons />
      </div>

      <div className="ml-1.5 min-w-0">
        <TitleBarBreadcrumb />
      </div>

      {/* ── Shortcut chips, centered between draggable spacers ── */}
      <div className="flex-1" />
      <ShortcutChips />
      <div className="flex-1" />

      {/* ── Right-side actions ────────────────────────────────── */}
      <div className="no-drag flex shrink-0 items-center gap-2 pr-3">
        <UpdateIndicator />

        <GitTitleBarControls />

        <TitleBarContributions />

        <ProfileSwitcher />

        <div className="mx-1 h-4 w-px bg-[var(--border-default)]" />

        <span className="text-base text-[var(--text-muted)]">⌘K</span>

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
          <TooltipContent side="bottom" className="chrome-zoom-invariant">Toggle agent</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Platform window-control area (right) ─────────────── */}
      {platform === 'win32' && (
        <div style={{ width: WINDOWS_OVERLAY_WIDTH }} className="shrink-0" />
      )}
      {platform === 'linux' && <WindowControls />}
    </header>
  );
});
