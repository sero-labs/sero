import { useEffect, useCallback } from 'react';
import { ActivityBar, type CodingPanel } from './ActivityBar';
import { CodingSidebar } from './CodingSidebar';
import { TerminalTabs } from './TerminalTabs';
import { TerminalPanel } from './TerminalPanel';
import { useActiveWorkspace } from '@/stores/workspace';
import {
  useWorkspaceTerminals,
  useActiveTerminalId,
  useTerminalStore,
  useWorkspaceCodingUi,
} from '@/stores/terminal';

/**
 * CodingWorkspace — the full coding app, mounted into the main area.
 *
 * ┌────┬──────┬───────────────────────────────────┐
 * │ A  │ Side │                                   │
 * │ c  │ bar  │       Editor / Dockview area       │
 * │ t  │      │       (empty for now)              │
 * │ .  │      ├───────────────────────────────────┤
 * │    │      │       Terminal Panel (bottom)      │
 * └────┴──────┴───────────────────────────────────┘
 *
 * All panel state (sidebar, terminal, active panel) is stored
 * per-workspace in the terminal store so it persists across
 * workspace switches.
 */
export function CodingWorkspace() {
  const activeWorkspace = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? 'scratchpad';

  // Per-workspace UI state (persists across workspace switches)
  const { sidebarOpen, activePanel, terminalOpen } = useWorkspaceCodingUi(workspaceId);
  const setCodingUi = useTerminalStore((s) => s.setCodingUi);

  const tabs = useWorkspaceTerminals(workspaceId);
  const activeTerminalId = useActiveTerminalId(workspaceId);

  // Set up terminal exit listener once on mount
  useEffect(() => {
    const cleanup = useTerminalStore.getState().initExitListener();
    return cleanup;
  }, []);

  // Auto-open terminal panel when first terminal is created
  useEffect(() => {
    if (tabs.length > 0 && !terminalOpen) {
      setCodingUi(workspaceId, { terminalOpen: true });
    }
  }, [tabs.length, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePanelClick = useCallback(
    (panel: CodingPanel) => {
      if (panel === 'terminal') {
        setCodingUi(workspaceId, { terminalOpen: !terminalOpen });
        return;
      }
      if (panel === activePanel && sidebarOpen) {
        setCodingUi(workspaceId, { sidebarOpen: false });
      } else {
        setCodingUi(workspaceId, { activePanel: panel, sidebarOpen: true });
      }
    },
    [workspaceId, activePanel, sidebarOpen, terminalOpen, setCodingUi],
  );

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      {/* ── Activity bar + sidebar + editor area ───────────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={activePanel}
          sidebarOpen={sidebarOpen}
          terminalOpen={terminalOpen}
          onPanelClick={handlePanelClick}
        />

        {sidebarOpen && <CodingSidebar activePanel={activePanel} />}

        {/* ── Main content area (editor + terminal) ──────────── */}
        <div className="flex flex-1 flex-col min-h-0 min-w-0">
          {/* ── Editor area (empty placeholder) ────────────────── */}
          <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)] min-h-0">
            <span className="text-sm text-[var(--text-muted)]">
              Editor area — Dockview panels will go here
            </span>
          </div>

          {/* ── Terminal panel (bottom, collapsible) ───────────── */}
          {terminalOpen && (
            <div className="flex h-[250px] min-h-[100px] max-h-[60%] shrink-0 flex-col border-t border-border/50">
              <TerminalTabs workspaceId={workspaceId} />
              <div className="relative flex-1 min-h-0 bg-[#0a0a0b]">
                {tabs.map((tab) => (
                  <TerminalPanel
                    key={tab.id}
                    terminalId={tab.id}
                    isActive={activeTerminalId === tab.id}
                  />
                ))}
                {tabs.length === 0 && (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs text-[var(--text-muted)]">
                      No terminals — click + to create one
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
