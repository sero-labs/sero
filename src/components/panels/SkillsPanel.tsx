import React, { useCallback, useEffect } from 'react';
import { useSkillStore } from '../../stores/skill-store';
import { BrowseView } from './skills/BrowseView';
import { DetailView } from './skills/DetailView';
import { InstallView } from './skills/InstallView';
import { CreateView } from './skills/CreateView';
import './SkillsPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

export function SkillsPanel({ projectId }: Props) {
  const {
    skills, selectedSkill, view, isLoading, searchQuery,
    setSkills, setSelectedSkill, setView, setLoading, setSearchQuery,
    contentCache, filesCache, cacheContent, cacheFiles,
    updateSkillEnabled, removeSkill, getFilteredSkills,
  } = useSkillStore();

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, [projectId]);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.sero.skills.discover();
      setSkills(result);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, setSkills, setLoading]);

  const handleToggle = useCallback(async (skillName: string) => {
    try {
      const newEnabled = await window.sero.skills.toggle(projectId, skillName);
      updateSkillEnabled(skillName, newEnabled);
    } catch (err) {
      console.error('Failed to toggle skill:', err);
    }
  }, [projectId, updateSkillEnabled]);

  const handleSelectSkill = useCallback(async (name: string) => {
    setSelectedSkill(name);

    if (!contentCache.has(name)) {
      const content = await window.sero.skills.readContent(name);
      if (content) cacheContent(name, content);
    }
    if (!filesCache.has(name)) {
      const files = await window.sero.skills.listFiles(name);
      cacheFiles(name, files);
    }
  }, [setSelectedSkill, contentCache, filesCache, cacheContent, cacheFiles]);

  const handleUninstall = useCallback(async (name: string) => {
    if (!confirm(`Are you sure you want to uninstall "${name}"? This will delete the skill directory.`)) return;
    try {
      const result = await window.sero.skills.uninstall(name);
      if (result.success) {
        removeSkill(name);
      } else {
        alert(`Failed to uninstall: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to uninstall skill:', err);
    }
  }, [removeSkill]);

  const handleRefresh = useCallback(async () => {
    const result = await window.sero.skills.discover();
    setSkills(result);
  }, [setSkills]);

  /** Called after install/create — re-discover, refresh list, switch to browse */
  const handleInstalled = useCallback(async () => {
    const result = await window.sero.skills.discover();
    setSkills(result);
    setView('browse');
    setSelectedSkill(null);
  }, [setSkills, setView, setSelectedSkill]);

  return (
    <div className="skills-panel">
      {/* Navigation bar */}
      <div className="skills-nav">
        <div className="skills-nav-tabs">
          <button
            className={`skills-nav-tab ${view === 'browse' || view === 'detail' ? 'active' : ''}`}
            onClick={() => { setView('browse'); setSelectedSkill(null); }}
          >
            Skills
          </button>
          <button
            className={`skills-nav-tab ${view === 'install' ? 'active' : ''}`}
            onClick={() => setView('install')}
          >
            Install
          </button>
          <button
            className={`skills-nav-tab ${view === 'create' ? 'active' : ''}`}
            onClick={() => setView('create')}
          >
            Create
          </button>
        </div>
        <button className="skills-nav-refresh" onClick={handleRefresh} title="Re-scan skills">
          ↻
        </button>
      </div>

      {/* Content */}
      <div className="skills-content">
        {view === 'browse' && (
          <BrowseView
            skills={getFilteredSkills()}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onSelect={handleSelectSkill}
            onToggle={handleToggle}
            onUninstall={handleUninstall}
          />
        )}
        {view === 'detail' && selectedSkill && (
          <DetailView
            skill={skills.find((s) => s.name === selectedSkill) ?? null}
            content={contentCache.get(selectedSkill) ?? null}
            files={filesCache.get(selectedSkill) ?? []}
            projectId={projectId}
            onBack={() => { setSelectedSkill(null); setView('browse'); }}
            onToggle={handleToggle}
            onUninstall={handleUninstall}
          />
        )}
        {view === 'install' && (
          <InstallView onInstalled={handleInstalled} />
        )}
        {view === 'create' && (
          <CreateView onCreated={handleInstalled} />
        )}
      </div>
    </div>
  );
}
