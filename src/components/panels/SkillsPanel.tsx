import React, { useCallback, useEffect, useState } from 'react';
import { useSkillStore, type SkillInfo } from '../../stores/skill-store';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
      const result = await window.sero.skills.list(projectId);
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

    // Load content if not cached
    if (!contentCache.has(name)) {
      const content = await window.sero.skills.readContent(name);
      if (content) cacheContent(name, content);
    }
    // Load files if not cached
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

/* ── Browse View ─────────────────────────────────────────────── */

function BrowseView({
  skills, isLoading, searchQuery, onSearch, onSelect, onToggle, onUninstall,
}: {
  skills: SkillInfo[];
  isLoading: boolean;
  searchQuery: string;
  onSearch: (q: string) => void;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  onUninstall: (name: string) => void;
}) {
  return (
    <div className="skills-browse">
      <div className="skills-search">
        <input
          type="text"
          className="skills-search-input"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="skills-loading">Loading skills...</div>
      ) : skills.length === 0 ? (
        <div className="skills-empty">
          <p className="skills-empty-title">No skills found</p>
          <p className="skills-empty-hint">
            Install skills from the Install tab, or create your own.
            Skills are discovered from <code>~/.pi/agent/skills/</code> and project <code>.pi/skills/</code> directories.
          </p>
        </div>
      ) : (
        <div className="skills-grid">
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              onSelect={() => onSelect(skill.name)}
              onToggle={() => onToggle(skill.name)}
              onUninstall={() => onUninstall(skill.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill, onSelect, onToggle, onUninstall,
}: {
  skill: SkillInfo;
  onSelect: () => void;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className={`skill-card ${skill.enabled ? '' : 'disabled'}`}>
      <div className="skill-card-header" onClick={onSelect}>
        <span className="skill-card-name">{skill.name}</span>
        <span className={`skill-card-scope scope-${skill.scope}`}>{skill.scope}</span>
      </div>
      <p className="skill-card-desc" onClick={onSelect}>{skill.description}</p>
      <div className="skill-card-footer">
        <button
          className={`skill-toggle ${skill.enabled ? 'enabled' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          title={skill.enabled ? 'Disable' : 'Enable'}
        >
          <span className="skill-toggle-track">
            <span className="skill-toggle-thumb" />
          </span>
        </button>
        <span className="skill-card-status">
          {skill.enabled ? 'Enabled' : 'Disabled'}
        </span>
        <button
          className="skill-card-delete"
          onClick={(e) => { e.stopPropagation(); onUninstall(); }}
          title="Uninstall skill"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ── Detail View ─────────────────────────────────────────────── */

function DetailView({
  skill, content, files, projectId, onBack, onToggle, onUninstall,
}: {
  skill: SkillInfo | null;
  content: string | null;
  files: string[];
  projectId: string;
  onBack: () => void;
  onToggle: (name: string) => void;
  onUninstall: (name: string) => void;
}) {
  if (!skill) return null;

  return (
    <div className="skills-detail">
      <div className="skills-detail-header">
        <button className="skills-back-btn" onClick={onBack}>← Back</button>
        <h2 className="skills-detail-name">{skill.name}</h2>
        <span className={`skill-card-scope scope-${skill.scope}`}>{skill.scope}</span>
      </div>

      <div className="skills-detail-actions">
        <button
          className={`skill-toggle-btn ${skill.enabled ? 'enabled' : ''}`}
          onClick={() => onToggle(skill.name)}
        >
          {skill.enabled ? '✓ Enabled' : '○ Disabled'}
        </button>
        <button
          className="skill-uninstall-btn"
          onClick={() => onUninstall(skill.name)}
        >
          Uninstall
        </button>
      </div>

      <p className="skills-detail-desc">{skill.description}</p>
      <p className="skills-detail-path">
        <span className="skills-detail-label">Path:</span> {skill.baseDir}
      </p>

      {/* Files */}
      {files.length > 0 && (
        <div className="skills-detail-files">
          <h3>Files</h3>
          <ul className="skills-file-list">
            {files.map((f) => (
              <li key={f} className="skills-file-item">{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* SKILL.md content */}
      {content && (
        <div className="skills-detail-content">
          <h3>Instructions (SKILL.md)</h3>
          <div className="skills-markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Install View ────────────────────────────────────────────── */

function InstallView({ onInstalled }: { onInstalled: () => void }) {
  const [source, setSource] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ success: boolean; name?: string; error?: string } | null>(null);

  const handleInstall = useCallback(async () => {
    if (!source.trim()) return;
    setInstalling(true);
    setResult(null);
    try {
      const res = await window.sero.skills.install(source.trim(), scope);
      setResult(res);
      if (res.success) {
        setSource('');
        onInstalled();
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setInstalling(false);
    }
  }, [source, scope, onInstalled]);

  return (
    <div className="skills-install">
      <h3>Install Skill</h3>
      <p className="skills-install-hint">
        Enter a git URL or local directory path containing a SKILL.md file.
      </p>

      <div className="skills-install-form">
        <input
          type="text"
          className="skills-install-input"
          placeholder="https://github.com/user/skill-repo or /path/to/skill"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleInstall(); }}
          disabled={installing}
        />

        <div className="skills-install-scope">
          <label className="skills-radio">
            <input
              type="radio"
              checked={scope === 'global'}
              onChange={() => setScope('global')}
            />
            Global (~/.pi/agent/skills/)
          </label>
          <label className="skills-radio">
            <input
              type="radio"
              checked={scope === 'project'}
              onChange={() => setScope('project')}
            />
            Project (.pi/skills/)
          </label>
        </div>

        <button
          className="skills-install-btn"
          onClick={handleInstall}
          disabled={installing || !source.trim()}
        >
          {installing ? 'Installing...' : 'Install'}
        </button>
      </div>

      {result && (
        <div className={`skills-install-result ${result.success ? 'success' : 'error'}`}>
          {result.success
            ? `✓ Installed "${result.name}" successfully`
            : `✗ ${result.error}`
          }
        </div>
      )}

      {/* Curated registries */}
      <div className="skills-registries">
        <h4>Skill Registries</h4>
        <div className="skills-registry-list">
          <RegistryLink
            name="Anthropic Skills"
            url="https://github.com/anthropics/skills"
            description="Document processing, web development"
          />
          <RegistryLink
            name="Pi Skills"
            url="https://github.com/badlogic/pi-skills"
            description="Web search, browser automation, Google APIs, transcription"
          />
        </div>
      </div>
    </div>
  );
}

function RegistryLink({ name, url, description }: { name: string; url: string; description: string }) {
  return (
    <div className="skills-registry-item">
      <div className="skills-registry-name">{name}</div>
      <div className="skills-registry-desc">{description}</div>
      <div className="skills-registry-url">
        <code>{url}</code>
      </div>
    </div>
  );
}

/* ── Create View ─────────────────────────────────────────────── */

function CreateView({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; path?: string; error?: string } | null>(null);

  const nameValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && !name.includes('--') && name.length <= 64;

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !description.trim() || !nameValid) return;
    setCreating(true);
    setResult(null);
    try {
      const res = await window.sero.skills.create(name.trim(), description.trim(), scope);
      setResult(res);
      if (res.success) {
        setName('');
        setDescription('');
        onCreated();
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setCreating(false);
    }
  }, [name, description, scope, nameValid, onCreated]);

  return (
    <div className="skills-create">
      <h3>Create Skill</h3>
      <p className="skills-create-hint">
        Scaffold a new skill with a SKILL.md template. You can edit the content afterwards in the detail view.
      </p>

      <div className="skills-create-form">
        <div className="skills-form-group">
          <label>Name</label>
          <input
            type="text"
            className={`skills-create-input ${name && !nameValid ? 'invalid' : ''}`}
            placeholder="my-skill-name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
          />
          {name && !nameValid && (
            <span className="skills-form-error">
              Lowercase a-z, 0-9, hyphens only. No leading/trailing/consecutive hyphens.
            </span>
          )}
        </div>

        <div className="skills-form-group">
          <label>Description</label>
          <textarea
            className="skills-create-textarea"
            placeholder="What this skill does and when the agent should use it..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="skills-install-scope">
          <label className="skills-radio">
            <input type="radio" checked={scope === 'global'} onChange={() => setScope('global')} />
            Global
          </label>
          <label className="skills-radio">
            <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} />
            Project
          </label>
        </div>

        <button
          className="skills-create-btn"
          onClick={handleCreate}
          disabled={creating || !name.trim() || !description.trim() || !nameValid}
        >
          {creating ? 'Creating...' : 'Create Skill'}
        </button>
      </div>

      {result && (
        <div className={`skills-install-result ${result.success ? 'success' : 'error'}`}>
          {result.success
            ? `✓ Created at ${result.path}`
            : `✗ ${result.error}`
          }
        </div>
      )}
    </div>
  );
}
