import { Button } from '@sero-ai/ui';
import { Plus } from 'lucide-react';

import type { ArchitectIndex, ArchitectIndexEntry } from '../../shared/types';
import { spendLabel, spendRatio, spendTone } from '../lib/format';
import { ActivityLines, ActivityGlyphIcon } from './ActivityWord';

export interface ProjectsListProps {
  projects: ArchitectIndexEntry[];
  /** Whether the Architect runtime is running in this Sero session. */
  runtime: ArchitectIndex['runtime'];
  /** Show only the rows that name an action. Owned by the top bar's toggle. */
  needsOnly: boolean;
  onOpen(projectId: string): void;
  onNewProject(): void;
}

/** "build · 1 of 2 milestones accepted". A count, never a percentage. */
function progressLine(entry: ArchitectIndexEntry): string {
  const { accepted, total } = entry.milestones;
  const work = total === 0 ? 'no milestones yet' : `${accepted} of ${total} milestones accepted`;
  return `${entry.phase} · ${work}`;
}

function ProjectRow({ entry, onOpen }: { entry: ArchitectIndexEntry; onOpen(id: string): void }) {
  const tone = spendTone(entry.spentUsd, entry.capUsd);
  return (
    <button
      type="button"
      className="ar-prow"
      data-needs={entry.activity.action ? 1 : 0}
      data-state={entry.activity.state}
      onClick={() => onOpen(entry.id)}
    >
      <span className="ar-prow-name">{entry.name}<small>{progressLine(entry)}</small></span>
      <span className="ar-prow-state"><ActivityLines activity={entry.activity} /></span>
      <span className="ar-prow-needs-action">{entry.activity.action ?? 'Nothing'}</span>
      <span className="ar-prow-spend">
        <b>{spendLabel(entry.spentUsd, entry.capUsd)}</b>
        <span className="ar-track" data-tone={tone}><i style={{ width: `${spendRatio(entry.spentUsd, entry.capUsd) * 100}%` }} /></span>
      </span>
    </button>
  );
}

export function ProjectsList({ projects, runtime, needsOnly, onOpen, onNewProject }: ProjectsListProps) {
  const shown = needsOnly ? projects.filter((entry) => entry.activity.action) : projects;

  return (
    <div className="ar-body">
      {runtime?.running === false && (
        // No dismiss: the condition clears itself the moment the runtime runs.
        <p className="ar-runtime-notice">
          <ActivityGlyphIcon state="last-known" />
          <span><b>Architect is not running in this session.</b> The states below are the last saved ones.</span>
        </p>
      )}
      {projects.length === 0 ? (
        <div className="ar-empty">
          <h3>No projects yet</h3>
          <p>Give Architect an idea and a folder. It researches the project, proposes a charter with a cost cap, then builds it milestone by milestone. It asks you when it needs a decision.</p>
          <Button size="sm" className="ar-btn ar-btn-solid" onClick={onNewProject}><Plus className="ar-i" />New project</Button>
        </div>
      ) : (
        <>
          <div className="ar-rowhead">
            <span>Project</span>
            <span>Activity</span>
            <span>Needs you</span>
            <span className="ar-sp">Spend</span>
          </div>
          {shown.map((entry) => <ProjectRow key={entry.id} entry={entry} onOpen={onOpen} />)}
        </>
      )}
    </div>
  );
}
