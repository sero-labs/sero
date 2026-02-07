/**
 * Create view: scaffold a new skill with a SKILL.md template.
 */
import React, { useCallback, useState } from 'react';

interface CreateViewProps {
  onCreated: () => void;
}

export function CreateView({ onCreated }: CreateViewProps) {
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
