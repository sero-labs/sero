/**
 * AdminApp — unified Sero Admin + Resources app.
 *
 * Sectioned vertical nav layout:
 *  - RESOURCES: Agents, Skills, Prompts (CRUD with list + editor)
 *  - CONFIG: Settings, Providers, Plugins
 *  - SYSTEM: Logs, Sessions
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { AdminSection, AdminState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useProfiles } from './hooks/useProfiles';
import { useAgentCrud } from './hooks/useAgentCrud';
import { usePromptCrud } from './hooks/usePromptCrud';
import { useSkillCrud } from './hooks/useSkillCrud';
import { useSkillVisibility } from './hooks/useSkillVisibility';
import { AgentEditor } from './components/AgentEditor';
import { AgentList } from './components/AgentList';
import { ConfigPanel } from './components/ConfigPanel';
import { Header } from './components/Header';
import { LogViewer } from './components/LogViewer';
import { ModelPanel } from './components/ModelPanel';
import { NavSidebar } from './components/NavSidebar';
import { PluginsPanel } from './components/PluginsPanel';
import { PromptEditor } from './components/PromptEditor';
import { PromptList } from './components/PromptList';
import { ResourceSection } from './components/ResourceSection';
import { SessionBrowser } from './components/SessionBrowser';
import { SkillEditor } from './components/SkillEditor';
import { SkillList } from './components/SkillList';
import './styles.css';

function normalizeSection(section: AdminState['lastSection'] | 'modelDefaults' | null | undefined): AdminSection {
  if (section === 'modelDefaults') return 'model';
  return section ?? 'agents';
}

export function AdminApp() {
  const [state, updateState] = useAppState<AdminState>(DEFAULT_STATE);
  const { activeProfile, loading: profilesLoading } = useProfiles();

  const [resourceLoading, setResourceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoredAgentRef = useRef<string | null>(null);
  const restoredSkillRef = useRef<string | null>(null);
  const restoredPromptRef = useRef<string | null>(null);
  const setErrorMsg = useCallback((msg: string) => setError(msg), []);

  const agentCrud = useAgentCrud(setErrorMsg, setSaving);
  const skillCrud = useSkillCrud(setErrorMsg, setSaving);
  const promptCrud = usePromptCrud(setErrorMsg, setSaving);
  const refreshAgents = agentCrud.refresh;
  const refreshSkills = skillCrud.refresh;
  const refreshPrompts = promptCrud.refresh;

  const profilePath = activeProfile?.path ?? null;
  const profileName = activeProfile?.name ?? null;
  const activeSection = normalizeSection(state.lastSection as AdminState['lastSection'] | 'modelDefaults' | null | undefined);
  const selectedConfigKey = state.lastConfigKey;
  const selectedSessionId = state.lastSessionFile;
  const skillVisibility = useSkillVisibility(profilePath);

  useEffect(() => {
    setResourceLoading(true);
    setError(null);
    Promise.all([refreshAgents(), refreshSkills(), refreshPrompts()]).finally(() => {
      setResourceLoading(false);
    });
  }, [refreshAgents, refreshPrompts, refreshSkills]);

  useEffect(() => {
    if (resourceLoading || !state.lastAgent) return;
    if (restoredAgentRef.current === state.lastAgent) return;
    if (agentCrud.selected === state.lastAgent) {
      restoredAgentRef.current = state.lastAgent;
      return;
    }
    if (!agentCrud.agents.some((agent) => agent.name === state.lastAgent)) return;

    restoredAgentRef.current = state.lastAgent;
    void agentCrud.select(state.lastAgent);
  }, [agentCrud, resourceLoading, state.lastAgent]);

  useEffect(() => {
    if (resourceLoading || !state.lastSkill) return;
    if (restoredSkillRef.current === state.lastSkill) return;
    if (skillCrud.selected === state.lastSkill) {
      restoredSkillRef.current = state.lastSkill;
      return;
    }
    if (!skillCrud.skills.some((skill) => skill.filePath === state.lastSkill)) return;

    restoredSkillRef.current = state.lastSkill;
    void skillCrud.select(state.lastSkill);
  }, [resourceLoading, skillCrud, state.lastSkill]);

  useEffect(() => {
    if (resourceLoading || !state.lastPrompt) return;
    if (restoredPromptRef.current === state.lastPrompt) return;
    if (promptCrud.selected === state.lastPrompt) {
      restoredPromptRef.current = state.lastPrompt;
      return;
    }
    if (!promptCrud.prompts.some((prompt) => prompt.filePath === state.lastPrompt)) return;

    restoredPromptRef.current = state.lastPrompt;
    void promptCrud.select(state.lastPrompt);
  }, [promptCrud, resourceLoading, state.lastPrompt]);

  const handleSectionChange = useCallback((section: AdminSection) => {
    setError(null);
    updateState((prev) => ({ ...prev, lastSection: section }));
  }, [updateState]);

  const handleSelectConfig = useCallback((key: string) => {
    updateState((prev) => ({ ...prev, lastConfigKey: key }));
  }, [updateState]);

  const handleSelectSession = useCallback((id: string | null) => {
    updateState((prev) => ({ ...prev, lastSessionFile: id }));
  }, [updateState]);

  const handleAgentSelect = useCallback(async (name: string) => {
    await agentCrud.select(name);
    restoredAgentRef.current = name;
    updateState((prev) => ({ ...prev, lastAgent: name }));
  }, [agentCrud, updateState]);

  const handleSkillSelect = useCallback(async (filePath: string) => {
    await skillCrud.select(filePath);
    restoredSkillRef.current = filePath;
    updateState((prev) => ({ ...prev, lastSkill: filePath }));
  }, [skillCrud, updateState]);

  const handlePromptSelect = useCallback(async (filePath: string) => {
    await promptCrud.select(filePath);
    restoredPromptRef.current = filePath;
    updateState((prev) => ({ ...prev, lastPrompt: filePath }));
  }, [promptCrud, updateState]);

  const getSkillVisibility = useCallback((skillName: string) => {
    const row = skillVisibility.skills.find((skill) => skill.name === skillName);
    return {
      visibleToModel: row?.visibleToModel ?? true,
      lockedHidden: row?.lockedHidden ?? false,
    };
  }, [skillVisibility.skills]);

  const handleSkillVisibilityChange = useCallback((skillName: string, visible: boolean) => {
    skillVisibility.setSkillEnabled(skillName, visible);
  }, [skillVisibility]);

  if (profilesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="admin-loading text-xs text-muted-foreground">Loading profiles…</div>
      </div>
    );
  }

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
                onSelect={handleAgentSelect}
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
        const visibility = skillCrud.editing && !skillCrud.isNew
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
                onSelect={handleSkillSelect}
              />
            }
            editor={skillCrud.editing ? (
              <SkillEditor
                data={skillCrud.editing}
                isNew={skillCrud.isNew}
                saving={saving}
                source={skillCrud.selectedSource}
                visibleToModel={visibility?.visibleToModel}
                lockedHidden={visibility?.lockedHidden}
                onVisibilityChange={
                  visibility
                    ? (visible) => handleSkillVisibilityChange(skillCrud.editing!.name, visible)
                    : undefined
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
                onSelect={handlePromptSelect}
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

      case 'model':
        return <ModelPanel />;

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
