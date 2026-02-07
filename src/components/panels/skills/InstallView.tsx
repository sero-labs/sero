/**
 * Install view: 2-step flow for installing skills from git repos or local paths.
 *
 * Step 1: Enter source URL/path → Preview (clone & scan)
 * Step 2: Select which skills to install from the discovered list → Install
 *
 * For single-skill sources (just one SKILL.md), skips step 2 and installs directly.
 */
import React, { useCallback, useState } from 'react';

interface InstallViewProps {
  onInstalled: () => void;
}

interface PreviewSkill {
  name: string;
  description: string;
  relativePath: string;
}

interface PreviewState {
  previewId: string;
  repoName: string;
  skills: PreviewSkill[];
  selected: Set<string>;
}

export function InstallView({ onInstalled }: InstallViewProps) {
  const [source, setSource] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /** Step 1: Clone/inspect the source and scan for skills */
  const handlePreview = useCallback(async () => {
    if (!source.trim()) return;
    setLoading(true);
    setLoadingLabel('Scanning repository...');
    setResult(null);
    setPreview(null);

    try {
      const res = await window.sero.skills.previewInstall(source.trim());

      if (res.skills.length === 0) {
        setResult({ type: 'error', message: 'No skills found in this source (no SKILL.md files detected).' });
        return;
      }

      // If only one skill, install directly (no need for selection UI)
      if (res.skills.length === 1) {
        setLoadingLabel('Installing...');
        const installRes = await window.sero.skills.installSelected(res.previewId, [res.skills[0].name], scope);
        if (installRes.installed.length > 0) {
          setResult({ type: 'success', message: `✓ Installed "${installRes.installed[0]}"` });
          setSource('');
          onInstalled();
        } else {
          const err = installRes.errors[0]?.error ?? 'Unknown error';
          setResult({ type: 'error', message: `✗ ${err}` });
        }
        return;
      }

      // Multiple skills found — show selection UI
      setPreview({
        previewId: res.previewId,
        repoName: res.repoName,
        skills: res.skills,
        selected: new Set(res.skills.map(s => s.name)), // All selected by default
      });
    } catch (err: any) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }, [source, scope, onInstalled]);

  /** Step 2: Install the selected skills */
  const handleInstallSelected = useCallback(async () => {
    if (!preview || preview.selected.size === 0) return;
    setLoading(true);
    setLoadingLabel('Installing selected skills...');
    setResult(null);

    try {
      const res = await window.sero.skills.installSelected(
        preview.previewId,
        Array.from(preview.selected),
        scope,
      );

      const messages: string[] = [];
      if (res.installed.length > 0) {
        messages.push(`✓ Installed ${res.installed.length} skill${res.installed.length > 1 ? 's' : ''}: ${res.installed.join(', ')}`);
      }
      for (const err of res.errors) {
        messages.push(`✗ ${err.name}: ${err.error}`);
      }

      setResult({
        type: res.installed.length > 0 ? 'success' : 'error',
        message: messages.join('\n'),
      });

      if (res.installed.length > 0) {
        setSource('');
        setPreview(null);
        onInstalled();
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }, [preview, scope, onInstalled]);

  /** Cancel preview and clean up temp dir */
  const handleCancelPreview = useCallback(() => {
    if (preview) {
      window.sero.skills.cleanupPreview(preview.previewId);
      setPreview(null);
    }
    setResult(null);
  }, [preview]);

  const toggleSkill = useCallback((name: string) => {
    if (!preview) return;
    setPreview(prev => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return { ...prev, selected: next };
    });
  }, [preview]);

  const toggleAll = useCallback((selectAll: boolean) => {
    if (!preview) return;
    setPreview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        selected: selectAll ? new Set(prev.skills.map(s => s.name)) : new Set(),
      };
    });
  }, [preview]);

  // ── Step 2: Skill selection checklist ────────────────────
  if (preview) {
    const allSelected = preview.selected.size === preview.skills.length;
    const noneSelected = preview.selected.size === 0;

    return (
      <div className="skills-install">
        <div className="skills-preview-header">
          <button className="skills-back-btn" onClick={handleCancelPreview}>← Back</button>
          <h3>Select Skills — {preview.repoName}</h3>
        </div>
        <p className="skills-install-hint">
          Found {preview.skills.length} skill{preview.skills.length > 1 ? 's' : ''} in this repository.
          Select which ones to install.
        </p>

        <div className="skills-preview-actions">
          <button
            className="skills-preview-toggle-all"
            onClick={() => toggleAll(!allSelected)}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <span className="skills-preview-count">
            {preview.selected.size} of {preview.skills.length} selected
          </span>
        </div>

        <div className="skills-preview-list">
          {preview.skills.map(skill => (
            <label key={skill.name} className="skills-preview-item">
              <input
                type="checkbox"
                checked={preview.selected.has(skill.name)}
                onChange={() => toggleSkill(skill.name)}
              />
              <div className="skills-preview-item-info">
                <span className="skills-preview-item-name">{skill.name}</span>
                <span className="skills-preview-item-desc">{skill.description}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="skills-install-scope">
          <label className="skills-radio">
            <input type="radio" checked={scope === 'global'} onChange={() => setScope('global')} />
            Global (~/.pi/agent/skills/)
          </label>
          <label className="skills-radio">
            <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} />
            Project (.pi/skills/)
          </label>
        </div>

        <button
          className="skills-install-btn"
          onClick={handleInstallSelected}
          disabled={loading || noneSelected}
        >
          {loading ? loadingLabel : `Install ${preview.selected.size} Skill${preview.selected.size !== 1 ? 's' : ''}`}
        </button>

        {result && (
          <div className={`skills-install-result ${result.type}`}>
            {result.message}
          </div>
        )}
      </div>
    );
  }

  // ── Step 1: Source URL input ─────────────────────────────
  return (
    <div className="skills-install">
      <h3>Install Skills</h3>
      <p className="skills-install-hint">
        Enter a git URL or local path. Sero will scan for skills and let you choose which to install.
      </p>

      <div className="skills-install-form">
        <input
          type="text"
          className="skills-install-input"
          placeholder="https://github.com/user/skill-repo or /path/to/skills"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handlePreview(); }}
          disabled={loading}
        />

        <button
          className="skills-install-btn"
          onClick={handlePreview}
          disabled={loading || !source.trim()}
        >
          {loading ? loadingLabel : 'Scan for Skills'}
        </button>
      </div>

      {result && (
        <div className={`skills-install-result ${result.type}`}>
          {result.message}
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
