import React, { useCallback, useEffect, useState } from 'react';
import { usePackageStore } from '../../stores/package-store';
import { BrowseView } from './packages/BrowseView';
import { InstallView } from './packages/InstallView';
import './PackagesPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

export function PackagesPanel({ projectId }: Props) {
  const {
    packages, resolved, view, isLoading, searchQuery,
    setPackages, setResolved, setView, setLoading, setSearchQuery,
    removePackage, getFilteredPackages,
  } = usePackageStore();

  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const [list, res] = await Promise.all([
        window.sero.packages.list(),
        window.sero.packages.resolve(),
      ]);
      setPackages(list);
      setResolved(res);
    } catch (err) {
      console.error('Failed to load packages:', err);
    } finally {
      setLoading(false);
    }
  }, [setPackages, setResolved, setLoading]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const handleRemove = useCallback(async (source: string) => {
    setPendingRemove(source);
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!pendingRemove) return;
    const source = pendingRemove;
    setPendingRemove(null);
    try {
      const result = await window.sero.packages.remove(source);
      if (result.success) {
        removePackage(source);
        const res = await window.sero.packages.resolve();
        setResolved(res);
      } else {
        setError(`Failed to remove: ${result.error}`);
      }
    } catch (err: any) {
      console.error('Failed to remove package:', err);
      setError(`Failed to remove package: ${err.message}`);
    }
  }, [pendingRemove, removePackage, setResolved]);

  const cancelRemove = useCallback(() => {
    setPendingRemove(null);
  }, []);

  const handleUpdate = useCallback(async (source?: string) => {
    try {
      const result = await window.sero.packages.update(source);
      if (result.success) {
        await loadPackages();
      } else {
        setError(`Update failed: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to update packages:', err);
    }
  }, [loadPackages]);

  const handleInstalled = useCallback(async () => {
    await loadPackages();
    setView('browse');
  }, [loadPackages, setView]);

  return (
    <div className="packages-panel">
      {pendingRemove && (
        <div className="packages-confirm-overlay">
          <div className="packages-confirm-dialog">
            <p>Remove package &ldquo;{pendingRemove}&rdquo;? This will uninstall it.</p>
            <div className="packages-confirm-actions">
              <button className="packages-confirm-cancel" onClick={cancelRemove}>Cancel</button>
              <button className="packages-confirm-ok" onClick={confirmRemove}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="packages-error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <div className="packages-nav">
        <div className="packages-nav-tabs">
          <button
            className={`packages-nav-tab ${view === 'browse' ? 'active' : ''}`}
            onClick={() => setView('browse')}
          >
            Packages
          </button>
          <button
            className={`packages-nav-tab ${view === 'install' ? 'active' : ''}`}
            onClick={() => setView('install')}
          >
            Install
          </button>
        </div>
        <button className="packages-nav-refresh" onClick={loadPackages} title="Refresh packages">
          ↻
        </button>
      </div>

      <div className="packages-content">
        {view === 'browse' && (
          <BrowseView
            packages={getFilteredPackages()}
            resolved={resolved}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onRemove={handleRemove}
            onUpdate={handleUpdate}
          />
        )}
        {view === 'install' && (
          <InstallView onInstalled={handleInstalled} />
        )}
      </div>
    </div>
  );
}
