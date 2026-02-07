/**
 * Detail view: full skill info, SKILL.md content, file list, toggle/uninstall.
 */
import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SkillInfo } from '../../../stores/skill-store';

interface DetailViewProps {
  skill: SkillInfo | null;
  content: string | null;
  files: string[];
  projectId: string;
  onBack: () => void;
  onToggle: (name: string) => void;
  onUninstall: (name: string) => void;
}

export function DetailView({
  skill, content, files, projectId, onBack, onToggle, onUninstall,
}: DetailViewProps) {
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
