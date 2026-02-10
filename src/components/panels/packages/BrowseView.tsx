/**
 * Browse view: list of installed PI packages with remove/update actions
 * and a breakdown of resolved resources (extensions, skills, prompts, themes).
 */
import React from 'react';
import type { PackageInfo, ResolvedResources } from '../../../stores/package-store';

interface BrowseViewProps {
  packages: PackageInfo[];
  resolved: ResolvedResources | null;
  isLoading: boolean;
  searchQuery: string;
  onSearch: (q: string) => void;
  onRemove: (source: string) => void;
  onUpdate: (source?: string) => void;
}

export function BrowseView({
  packages, resolved, isLoading, searchQuery, onSearch, onRemove, onUpdate,
}: BrowseViewProps) {
  const totalResources = resolved
    ? resolved.extensions.length + resolved.skills.length + resolved.prompts.length + resolved.themes.length
    : 0;

  return (
    <div className="packages-browse">
      <div className="packages-search">
        <input
          type="text"
          className="packages-search-input"
          placeholder="Search packages..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="packages-loading">Loading packages...</div>
      ) : packages.length === 0 ? (
        <div className="packages-empty">
          <p className="packages-empty-title">No packages installed</p>
          <p className="packages-empty-hint">
            Install packages from the Install tab. Packages can contain skills, extensions, prompts, and themes.
            <br />
            Supported sources: <code>npm:@scope/pkg</code>, <code>git:github.com/user/repo</code>, or local paths.
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          {totalResources > 0 && (
            <div className="packages-summary">
              {resolved!.skills.length > 0 && (
                <span className="packages-summary-badge badge-skills">
                  {resolved!.skills.length} skill{resolved!.skills.length !== 1 ? 's' : ''}
                </span>
              )}
              {resolved!.extensions.length > 0 && (
                <span className="packages-summary-badge badge-extensions">
                  {resolved!.extensions.length} extension{resolved!.extensions.length !== 1 ? 's' : ''}
                </span>
              )}
              {resolved!.prompts.length > 0 && (
                <span className="packages-summary-badge badge-prompts">
                  {resolved!.prompts.length} prompt{resolved!.prompts.length !== 1 ? 's' : ''}
                </span>
              )}
              {resolved!.themes.length > 0 && (
                <span className="packages-summary-badge badge-themes">
                  {resolved!.themes.length} theme{resolved!.themes.length !== 1 ? 's' : ''}
                </span>
              )}
              <button
                className="packages-update-all-btn"
                onClick={() => onUpdate()}
                title="Update all packages"
              >
                Update All
              </button>
            </div>
          )}

          {/* Package list */}
          <div className="packages-grid">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.source}
                pkg={pkg}
                resolved={resolved}
                onRemove={() => onRemove(pkg.source)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PackageCard({
  pkg, resolved, onRemove,
}: {
  pkg: PackageInfo;
  resolved: ResolvedResources | null;
  onRemove: () => void;
}) {
  // Count resources contributed by this package
  const matchSource = (r: { source: string }) => r.source === pkg.source;
  const skillCount = resolved?.skills.filter(matchSource).length ?? 0;
  const extCount = resolved?.extensions.filter(matchSource).length ?? 0;
  const promptCount = resolved?.prompts.filter(matchSource).length ?? 0;
  const themeCount = resolved?.themes.filter(matchSource).length ?? 0;
  const hasResources = skillCount + extCount + promptCount + themeCount > 0;

  return (
    <div className="package-card">
      <div className="package-card-header">
        <span className="package-card-source">{pkg.source}</span>
        <span className={`package-card-scope scope-${pkg.scope}`}>{pkg.scope}</span>
      </div>

      {hasResources && (
        <div className="package-card-resources">
          {skillCount > 0 && <span className="resource-tag tag-skills">{skillCount} skill{skillCount !== 1 ? 's' : ''}</span>}
          {extCount > 0 && <span className="resource-tag tag-extensions">{extCount} ext</span>}
          {promptCount > 0 && <span className="resource-tag tag-prompts">{promptCount} prompt{promptCount !== 1 ? 's' : ''}</span>}
          {themeCount > 0 && <span className="resource-tag tag-themes">{themeCount} theme{themeCount !== 1 ? 's' : ''}</span>}
        </div>
      )}

      <div className="package-card-footer">
        <button
          className="package-card-remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Remove package"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
