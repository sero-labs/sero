import { Button } from '@sero-ai/ui';
import { Plus } from 'lucide-react';

import type { ArchitectIndexEntry } from '../../shared/types';
import { OVERLAY_LABEL, glyph, overlayTone, spendLabel, spendRatio, spendTone } from '../lib/format';
import { Pill } from './Pill';

export interface ProjectsListProps {
  projects: ArchitectIndexEntry[];
  onOpen(projectId: string): void;
  onNewProject(): void;
}

function ProjectRow({ entry, onOpen }: { entry: ArchitectIndexEntry; onOpen(id: string): void }) {
  const tone = spendTone(entry.spentUsd, entry.capUsd);
  return (
    <button type="button" className="ar-prow" data-needs={entry.needsYou > 0 ? 1 : 0} onClick={() => onOpen(entry.id)}>
      <span className="ar-glyph">{glyph(entry.name)}</span>
      <span className="ar-prow-name">{entry.name}<small>{entry.id}</small></span>
      <span className="ar-prow-state">{entry.stateLine}</span>
      <span>
        {entry.overlay ? <Pill tone={overlayTone(entry.overlay)}>{OVERLAY_LABEL[entry.overlay]}</Pill> : <Pill tone="ok">{entry.phase}</Pill>}
      </span>
      <span className="ar-prow-spend">
        <b>{spendLabel(entry.spentUsd, entry.capUsd)}</b>
        <span className="ar-track" data-tone={tone}><i style={{ width: `${spendRatio(entry.spentUsd, entry.capUsd) * 100}%` }} /></span>
      </span>
      <span className="ar-prow-needs">
        {entry.needsYou > 0 && <span className="ar-count" aria-label={`${entry.needsYou} needs you`}>{entry.needsYou}</span>}
      </span>
    </button>
  );
}

export function ProjectsList({ projects, onOpen, onNewProject }: ProjectsListProps) {
  return (
    <div className="ar-body">
      <div className="ar-list-head">Projects<span className="ar-line" /><span className="ar-hint">state · phase · spend · needs you</span></div>
      {projects.length === 0 ? (
        <div className="ar-empty">
          <h3>No projects yet</h3>
          <p>Give the Architect an idea and a folder. It researches, proposes a charter with a cost cap, and builds milestone by milestone, asking you only for the decisions that are yours.</p>
          <Button size="sm" className="ar-btn ar-btn-primary" onClick={onNewProject}><Plus className="ar-i" />New project</Button>
        </div>
      ) : (
        projects.map((entry) => <ProjectRow key={entry.id} entry={entry} onOpen={onOpen} />)
      )}
    </div>
  );
}
