/**
 * Browse view: searchable grid of installed skills with toggle/uninstall actions.
 */
import React from 'react';
import type { SkillInfo } from '../../../stores/skill-store';

interface BrowseViewProps {
  skills: SkillInfo[];
  isLoading: boolean;
  searchQuery: string;
  onSearch: (q: string) => void;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  onUninstall: (name: string) => void;
}

export function BrowseView({
  skills, isLoading, searchQuery, onSearch, onSelect, onToggle, onUninstall,
}: BrowseViewProps) {
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
