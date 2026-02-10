/**
 * Install view: enter a package source (npm, git, local path) and install it.
 */
import React, { useCallback, useState } from 'react';

interface InstallViewProps {
  onInstalled: () => void;
}

export function InstallView({ onInstalled }: InstallViewProps) {
  const [source, setSource] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleInstall = useCallback(async () => {
    const trimmed = source.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);

    try {
      // PI SDK: { local: true } = project-scoped install (not "local path" source type)
      const res = await window.sero.packages.install(trimmed, { local: scope === 'project' });

      if (res.success) {
        setResult({ type: 'success', message: `Installed "${trimmed}"` });
        setSource('');
        onInstalled();
      } else {
        setResult({ type: 'error', message: res.error ?? 'Unknown error' });
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [source, scope, onInstalled]);

  return (
    <div className="packages-install">
      <h3>Install Package</h3>
      <p className="packages-install-hint">
        Enter an npm package, git URL, or local path. The package will be installed
        and its resources (skills, extensions, prompts, themes) will become available.
      </p>

      <div className="packages-install-form">
        <input
          type="text"
          className="packages-install-input"
          placeholder="npm:@scope/pkg, git:github.com/user/repo, or /local/path"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleInstall(); }}
          disabled={loading}
        />

        <div className="packages-install-scope">
          <label className="packages-radio">
            <input type="radio" checked={scope === 'global'} onChange={() => setScope('global')} />
            Global (user-wide)
          </label>
          <label className="packages-radio">
            <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} />
            Project-local
          </label>
        </div>

        <button
          className="packages-install-btn"
          onClick={handleInstall}
          disabled={loading || !source.trim()}
        >
          {loading ? 'Installing...' : 'Install'}
        </button>
      </div>

      {result && (
        <div className={`packages-install-result ${result.type}`}>
          {result.message}
        </div>
      )}

      <div className="packages-source-help">
        <h4>Supported Sources</h4>
        <div className="packages-source-list">
          <SourceExample
            format="npm"
            example="npm:@mariozechner/pi-web-search"
            description="npm package (installed globally via npm)"
          />
          <SourceExample
            format="git"
            example="git:github.com/badlogic/pi-skills"
            description="Git repository (cloned to ~/.pi/agent/git/)"
          />
          <SourceExample
            format="https"
            example="https://github.com/user/repo"
            description="GitHub URL (auto-detected as git)"
          />
          <SourceExample
            format="local"
            example="/path/to/local/package"
            description="Local directory (referenced in-place)"
          />
        </div>
      </div>
    </div>
  );
}

function SourceExample({ format, example, description }: { format: string; example: string; description: string }) {
  return (
    <div className="packages-source-item">
      <span className="packages-source-format">{format}</span>
      <code className="packages-source-example">{example}</code>
      <span className="packages-source-desc">{description}</span>
    </div>
  );
}
