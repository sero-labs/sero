import { useState } from 'react';
import { ProjectBar } from './ProjectBar';
import { ActivityBar, type CodingPanel } from './ActivityBar';
import { CodingSidebar } from './CodingSidebar';

/**
 * CodingWorkspace — the full coding app, mounted into the main area.
 *
 * ┌──────────────────────────────────────────────┐
 * │  ProjectBar (project tabs)                    │
 * ├────┬──────┬───────────────────────────────────┤
 * │ A  │ Side │                                   │
 * │ c  │ bar  │       Editor / Dockview area       │
 * │ t  │      │       (empty for now)              │
 * │ .  │      │                                   │
 * ├────┴──────┴───────────────────────────────────┤
 *
 * The ChatPanel is no longer here — it lives at the shell level
 * so it persists across all apps.
 *
 * All state is local to this component for now.
 */
export function CodingWorkspace() {
  const [activePanel, setActivePanel] = useState<CodingPanel>('explorer');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function handlePanelClick(panel: CodingPanel) {
    if (panel === activePanel && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActivePanel(panel);
      setSidebarOpen(true);
    }
  }

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      {/* ── Project tabs ───────────────────────────────────────── */}
      <ProjectBar />

      {/* ── Activity bar + sidebar + editor area ───────────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={activePanel}
          sidebarOpen={sidebarOpen}
          onPanelClick={handlePanelClick}
        />

        {sidebarOpen && <CodingSidebar activePanel={activePanel} />}

        {/* ── Editor area (empty placeholder) ──────────────────── */}
        <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
          <span className="text-sm text-[var(--text-muted)]">
            Editor area — Dockview panels will go here
          </span>
        </div>
      </div>
    </div>
  );
}
