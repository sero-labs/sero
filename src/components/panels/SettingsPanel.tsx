import React, { useCallback, useEffect, useState } from 'react';
import './SettingsPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

interface EnvEntry {
  key: string;
  value: string;
}

export function SettingsPanel({ projectId }: Props) {
  const [envVars, setEnvVars] = useState<EnvEntry[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [showValues, setShowValues] = useState<Set<string>>(new Set());

  // Load env vars on mount
  useEffect(() => {
    (async () => {
      const env = await window.sero.env.list();
      setEnvVars(
        Object.entries(env).map(([key, value]) => ({ key, value }))
      );
    })();
  }, []);

  const handleAdd = useCallback(async () => {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key) return;

    setSaving(true);
    try {
      await window.sero.env.set(key, value);
      setEnvVars((prev) => {
        const exists = prev.findIndex((e) => e.key === key);
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = { key, value };
          return next;
        }
        return [...prev, { key, value }];
      });
      setNewKey('');
      setNewValue('');
    } finally {
      setSaving(false);
    }
  }, [newKey, newValue]);

  const handleRemove = useCallback(async (key: string) => {
    await window.sero.env.remove(key);
    setEnvVars((prev) => prev.filter((e) => e.key !== key));
    setShowValues((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleUpdate = useCallback(async (key: string, value: string) => {
    await window.sero.env.set(key, value);
    setEnvVars((prev) =>
      prev.map((e) => (e.key === key ? { ...e, value } : e))
    );
  }, []);

  const toggleShow = useCallback((key: string) => {
    setShowValues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h2 className="settings-title">Environment Variables</h2>
        <p className="settings-hint">
          These are injected into every container exec and terminal session.
          Use them for API keys (TAVILY_API_KEY, etc.) and other secrets.
          Changes apply immediately to new commands — no restart needed.
        </p>

        {/* Existing vars */}
        <div className="env-list">
          {envVars.length === 0 && (
            <div className="env-empty">No environment variables set</div>
          )}
          {envVars.map((entry) => (
            <div key={entry.key} className="env-row">
              <span className="env-key">{entry.key}</span>
              <div className="env-value-container">
                <input
                  type={showValues.has(entry.key) ? 'text' : 'password'}
                  className="env-value"
                  value={entry.value}
                  onChange={(e) => handleUpdate(entry.key, e.target.value)}
                />
                <button
                  className="env-toggle-vis"
                  onClick={() => toggleShow(entry.key)}
                  title={showValues.has(entry.key) ? 'Hide' : 'Show'}
                >
                  {showValues.has(entry.key) ? '👁' : '👁‍🗨'}
                </button>
              </div>
              <button
                className="env-remove"
                onClick={() => handleRemove(entry.key)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="env-add">
          <input
            type="text"
            className="env-add-key"
            placeholder="KEY_NAME"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <input
            type="text"
            className="env-add-value"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button
            className="env-add-btn"
            onClick={handleAdd}
            disabled={!newKey.trim() || saving}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
