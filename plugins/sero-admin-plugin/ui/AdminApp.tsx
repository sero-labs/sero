/**
 * AdminApp — unified Sero Admin + Resources app.
 *
 * Sectioned vertical nav layout:
 *  - RESOURCES: Agents, Skills, Prompts (CRUD with list + editor)
 *  - CONFIG: Settings, Defaults, Plugins
 *  - SYSTEM: Logs, Sessions
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { AdminState, AdminSection } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useProfiles } from './hooks/useSeroFiles';
import { useAgentCrud } from './hooks/useAgentCrud';
import { useSkillCrud } from './hooks/useSkillCrud';
import { usePromptCrud } from './hooks/usePromptCrud';
import { useSkillVisibility } from './hooks/useSkillVisibility';
import { Header } from './components/Header';
import { NavSidebar } from './components/NavSidebar';
import { ResourceSection } from './components/ResourceSection';
import { AgentList } from './components/AgentList';
import { AgentEditor } from './components/AgentEditor';
import { SkillList } from './components/SkillList';
import { SkillEditor } from './components/SkillEditor';
import { PromptList } from './components/PromptList';
import { PromptEditor } from './components/PromptEditor';
import { ConfigPanel } from './components/ConfigPanel';
import { ModelDefaultsPanel } from './components/ModelDefaultsPanel';
import { PluginsPanel } from './components/PluginsPanel';
import { LogViewer } from './components/LogViewer';
import { SessionBrowser } from './components/SessionBrowser';
import './styles.css';

export function AdminApp() {
  const [state, updateState] = useAppState<AdminState>(DEFAULT_STATE);
  const { activeProfile, loading: profilesLoading } = useProfiles();

  const [activeSection, setActiveSection] = useState<AdminSection>(state.lastSection ?? 'agents');
  const [selectedConfigKey, setSelectedConfigKey] = useState<string | null>(state.lastConfigKey);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(state.lastSessionFile);

  // ── Resource CRUD state ───────────────────────────────────
  const [resourceLoading, setResourceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setErrorMsg = useCallback((msg: string) => setError(msg), []);

  const agentCrud = useAgentCrud(setErrorMsg, setSaving);
  const skillCrud = useSkillCrud(setErrorMsg, setSaving);
  const promptCrud = usePromptCrud(setErrorMsg, setSaving);

  const profilePath = activeProfile?.path ?? null;
  const profileName = activeProfile?.name ?? null;

  // Skill visibility (for the toggle in SkillEditor)
  const skillVisibility = useSkillVisibility(profilePath);

  // Initial load for resources
  useEffect(() => {
    setResourceLoading(true);
    setError(null);
    Promise.all([agentCrud.refresh(), skillCrud.refresh(), promptCrud.refresh()]).finally(() =>
      setResourceLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence callbacks ─────────────────────────────────

  const handleSectionChange = useCallback((section: AdminSection) => {
    setActiveSection(section);
    setError(null);
    updateState((prev) => ({ ...prev, lastSection: section }));
  }, [updateState]);

  const handleSelectConfig = useCallback((key: string) => {
    setSelectedConfigKey(key);
    updateState((prev) => ({ ...prev, lastConfigKey: key }));
  }, [updateState]);

  const handleSelectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    updateState((prev) => ({ ...prev, lastSessionFile: id }));
  }, [updateState]);

  // ── Skill visibility lookup for the editor ────────────────

  const getSkillVisibility = useCallback((skillName: string) => {
    const row = skillVisibility.skills.find((s) => s.name === skillName);
    return {
      visibleToModel: row?.visibleToModel ?? true,
      lockedHidden: row?.lockedHidden ?? false,
    };
  }, [skillVisibility.skills]);

  const handleSkillVisibilityChange = useCallback((skillName: string, visible: boolean) => {
    skillVisibility.setSkillEnabled(skillName, visible);
  }, [skillVisibility]);

  // ── Loading state ─────────────────────────────────────────

  if (profilesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="admin-loading text-xs text-muted-foreground">Loading profiles…</div>
      </div>
    );
  }

  // ── Section content renderer ──────────────────────────────

  const renderSection = () => {
    switch (activeSection) {
      case 'agents':
        return (
          <ResourceSection
            label="Agent"
            count={agentCrud.agents.length}
            loading={resourceLoading}
            error={error}
            onRefresh={agentCrud.refresh}
            onNew={agentCrud.startNew}
            list={
              <AgentList
                agents={agentCrud.agents}
                selected={agentCrud.selected}
                onSelect={agentCrud.select}
              />
            }
            editor={agentCrud.editing ? (
              <AgentEditor
                data={agentCrud.editing}
                isNew={agentCrud.isNew}
                saving={saving}
                onSave={agentCrud.save}
                onDelete={agentCrud.remove}
                onChange={agentCrud.setEditing}
              />
            ) : null}
          />
        );

      case 'skills': {
        const vis = skillCrud.editing && !skillCrud.isNew
          ? getSkillVisibility(skillCrud.editing.name)
          : null;
        return (
          <ResourceSection
            label="Skill"
            count={skillCrud.skills.length}
            loading={resourceLoading}
            error={error}
            onRefresh={skillCrud.refresh}
            onNew={skillCrud.startNew}
            list={
              <SkillList
                skills={skillCrud.skills}
                selected={skillCrud.selected}
                onSelect={skillCrud.select}
              />
            }
            editor={skillCrud.editing ? (
              <SkillEditor
                data={skillCrud.editing}
                isNew={skillCrud.isNew}
                saving={saving}
                source={skillCrud.selectedSource}
                visibleToModel={vis?.visibleToModel}
                lockedHidden={vis?.lockedHidden}
                onVisibilityChange={
                  vis ? (visible) => handleSkillVisibilityChange(skillCrud.editing!.name, visible) : undefined
                }
                onSave={skillCrud.save}
                onDelete={skillCrud.remove}
                onChange={skillCrud.setEditing}
              />
            ) : null}
          />
        );
      }

      case 'prompts':
        return (
          <ResourceSection
            label="Prompt"
            count={promptCrud.prompts.length}
            loading={resourceLoading}
            error={error}
            onRefresh={promptCrud.refresh}
            onNew={promptCrud.startNew}
            list={
              <PromptList
                prompts={promptCrud.prompts}
                selected={promptCrud.selected}
                onSelect={promptCrud.select}
              />
            }
            editor={promptCrud.editing ? (
              <PromptEditor
                data={promptCrud.editing}
                isNew={promptCrud.isNew}
                saving={saving}
                onSave={promptCrud.save}
                onDelete={promptCrud.remove}
                onChange={promptCrud.setEditing}
              />
            ) : null}
          />
        );

      case 'settings':
        return (
          <ConfigPanel
            profilePath={profilePath}
            selectedKey={selectedConfigKey}
            onSelectKey={handleSelectConfig}
          />
        );

      case 'modelDefaults':
        return <ModelDefaultsPanel />;

      case 'plugins':
        return <PluginsPanel />;

      case 'logs':
        return <LogViewer />;

      case 'sessions':
        return (
          <SessionBrowser
            selectedSessionId={selectedSessionId}
            onSelectSession={handleSelectSession}
          />
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header profileName={profileName} activeSection={activeSection} />
      <div className="flex min-h-0 flex-1">
        <NavSidebar active={activeSection} onSelect={handleSectionChange} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div key={activeSection} className="admin-fade-in flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminApp;
