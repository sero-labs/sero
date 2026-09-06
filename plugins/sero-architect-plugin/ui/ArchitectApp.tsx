import { useAppState } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';
import { Compass } from 'lucide-react';

import type { ArchitectIndex, ArchitectIndexEntry } from '../shared/types';
import { DEFAULT_INDEX, normalizeIndex } from '../shared/types';
import './styles.css';

function spendLabel(entry: ArchitectIndexEntry): string {
  const spent = `$${entry.spentUsd.toFixed(1).replace(/\.0$/, '')}`;
  return entry.capUsd === null ? `${spent} · no cap` : `${spent} / $${entry.capUsd}`;
}

function ProjectRow({ entry }: { entry: ArchitectIndexEntry }) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <span className="grid size-6 place-items-center rounded-md bg-muted font-mono text-xs font-semibold text-muted-foreground">
        {entry.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</span>
      <span className="min-w-0 flex-[2] truncate text-sm text-muted-foreground">{entry.stateLine}</span>
      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {entry.overlay ?? entry.phase}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{spendLabel(entry)}</span>
      {entry.needsYou > 0 && (
        <span className="grid min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 font-mono text-[10px] font-semibold text-amber-950">
          {entry.needsYou}
        </span>
      )}
    </li>
  );
}

export function ArchitectApp() {
  // The watched index is the app's state file. Nothing else reaches the page.
  const [stored] = useAppState<ArchitectIndex>(DEFAULT_INDEX);
  const index = normalizeIndex(stored);

  return (
    <div className="flex size-full flex-col gap-5 overflow-hidden bg-background p-6 text-foreground">
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <span className="grid size-6 place-items-center rounded-md border border-border text-primary">
          <Compass className="size-3.5" />
        </span>
        <h1 className="text-sm font-semibold">Architect</h1>
        <span className="ml-auto text-xs text-muted-foreground">Projects the Architect owns for you</span>
      </header>

      {index.projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-base font-medium">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Give the Architect an idea and a folder. It researches, proposes a charter with a cost cap, and
            builds milestone by milestone, asking you only for the decisions that are yours.
          </p>
          <Button size="sm" disabled title="Project intake arrives with the record store">
            New project
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {index.projects.map((entry) => (
            <ProjectRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default ArchitectApp;
