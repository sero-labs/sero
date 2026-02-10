import React, { useCallback, useEffect } from 'react';
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

  useEffect(() => {
    loadPackages();
  }, []);

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

  const handleRemove = useCallback(async (source: string) => {
    if (!confirm(`Remove package "${source}"? This will uninstall it.`)) return;
    try {
      const result = await window.sero.packages.remove(source);
      if (result.success) {
        removePackage(source);
        // Re-resolve to update resource listing
        const res = await window.sero.packages.resolve();
        setResolved(res);
      } else {
        alert(`Failed to remove: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to remove package:', err);
    }
  }, [removePackage, setResolved]);

  const handleUpdate = useCallback(async (source?: string) => {
    try {
      const result = await window.sero.packages.update(source);
      if (result.success) {
        await loadPackages();
      } else {
        alert(`Update failed: ${result.error}`);
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
