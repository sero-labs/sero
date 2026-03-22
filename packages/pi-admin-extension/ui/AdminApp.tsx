/**
 * AdminApp — main Sero Admin app component.
 *
 * Four-tab interface:
 *  - Config: browse and edit Sero configuration files
 *  - Skills: control which skills stay visible to the model by default
 *  - Logs: view Sero log files with auto-refresh
 *  - Sessions: browse session data (CSS content-visibility skip)
 *
 * Uses CSS fade transitions for smooth tab switching.
 * Profile-aware — shows active profile and reads from the correct path.
 */

import { useState, useCallback } from 'react';
import { useAppState } from '@sero/app-runtime';
import { cn } from '@sero/ui/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sero/ui/components/ui/tabs';
import type { AdminState, AdminTab } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useProfiles } from './hooks/useSeroFiles';
import { Header } from './components/Header';
import { ConfigPanel } from './components/ConfigPanel';
import { SkillsPanel } from './components/SkillsPanel';
import { LogViewer } from './components/LogViewer';
import { SessionBrowser } from './components/SessionBrowser';
import './styles.css';

export function AdminApp() {
  const [state, updateState] = useAppState<AdminState>(DEFAULT_STATE);
  const { activeProfile, loading: profilesLoading } = useProfiles();

  const [activeTab, setActiveTab] = useState<AdminTab>(state.lastTab ?? 'config');
  const [selectedConfigKey, setSelectedConfigKey] = useState<string | null>(
    state.lastConfigKey,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    state.lastSessionFile,
  );

  // Persist tab preference
  const handleTabChange = useCallback((value: string) => {
    const tab = value as AdminTab;
    setActiveTab(tab);
    updateState((prev) => ({ ...prev, lastTab: tab }));
  }, [updateState]);

  // Persist selected config
  const handleSelectConfig = useCallback((key: string) => {
    setSelectedConfigKey(key);
    updateState((prev) => ({ ...prev, lastConfigKey: key }));
  }, [updateState]);

  // Persist selected session
  const handleSelectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    updateState((prev) => ({ ...prev, lastSessionFile: id }));
  }, [updateState]);

  const profilePath = activeProfile?.path ?? null;
  const profileName = activeProfile?.name ?? null;

  if (profilesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="admin-loading text-xs text-muted-foreground">Loading profiles…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header profileName={profileName} activeTab={activeTab} />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        {/* Tab bar */}
        <div className="border-b border-border/30 px-4">
          <TabsList variant="line" className="h-8 gap-0">
            <TabsTrigger
              value="config"
              className={cn(
                'h-8 rounded-none px-3 text-xs',
                activeTab === 'config' && 'text-indigo-400',
              )}
            >
              <span className="flex items-center gap-1.5">
                <ConfigIcon />
                Config
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="skills"
              className={cn(
                'h-8 rounded-none px-3 text-xs',
                activeTab === 'skills' && 'text-indigo-400',
              )}
            >
              <span className="flex items-center gap-1.5">
                <SkillsIcon />
                Skills
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className={cn(
                'h-8 rounded-none px-3 text-xs',
                activeTab === 'logs' && 'text-emerald-400',
              )}
            >
              <span className="flex items-center gap-1.5">
                <LogIcon />
                Logs
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="sessions"
              className={cn(
                'h-8 rounded-none px-3 text-xs',
                activeTab === 'sessions' && 'text-emerald-400',
              )}
            >
              <span className="flex items-center gap-1.5">
                <SessionIcon />
                Sessions
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab content — each must be a flex column with overflow
             hidden so children can fill height and scroll internally. */}
        <TabsContent value="config" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ConfigPanel
            profilePath={profilePath}
            selectedKey={selectedConfigKey}
            onSelectKey={handleSelectConfig}
          />
        </TabsContent>

        <TabsContent value="skills" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SkillsPanel profilePath={profilePath} />
        </TabsContent>

        <TabsContent value="logs" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <LogViewer />
        </TabsContent>

        <TabsContent value="sessions" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SessionBrowser
            selectedSessionId={selectedSessionId}
            onSelectSession={handleSelectSession}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab icons (inline SVGs to avoid Lucide dependency) ─────

function ConfigIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </svg>
  );
}

function SkillsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20" />
      <path d="M7 8.5h6a3.5 3.5 0 1 0 0-7H9" />
      <path d="M7 15.5h8a3.5 3.5 0 1 1 0 7H9" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SessionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default AdminApp;
