import { useEffect, useState } from 'react';
import { Button, SubagentLiveBlock } from '@sero-ai/ui';
import { Eye } from 'lucide-react';
import type { PendingResearch, ProjectRecord, ResearchResult } from '../../shared/record';
import { openDispatch } from '../lib/page-helpers';
import { SectionHead } from './Pill';

/** `0:42`, or `1:02:03` past an hour. */
function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = `${total % 60}`.padStart(2, '0');
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${`${minutes}`.padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * Research that the Architect runs directly as one agent, while it runs.
 *
 * It has no Room or Workflow behind it, so it used to appear nowhere on the
 * page. The card shows the question it is answering, and the eye opens its live
 * block. When it ends, its findings stay on the card like any other research.
 */
function DirectResearch({ question, stoppingCondition, runId, startedAt }: {
  question: string;
  stoppingCondition: string;
  runId: string;
  startedAt: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <p className="ar-why flex items-center gap-1.5">
        <span>Researching {elapsedLabel(now - new Date(startedAt).getTime())}</span>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded-[5px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
          onClick={() => setWatching((open) => !open)}
          aria-expanded={watching}
          aria-label={`Watch the agent for ${question}`}
          title="Watch the agent"
        >
          <Eye className="size-3.5" />
        </button>
      </p>
      {watching && <SubagentLiveBlock className="mt-2" runId={runId} monospace />}
      <p className="ar-why hidden">{stoppingCondition}</p>
    </>
  );
}

/** The card's action or wait line: a finished entry, a running one, or a wait. */
function ResearchStatus({ entry, record }: { entry: PendingResearch | ResearchResult; record: ProjectRecord }) {
  if ('result' in entry) {
    // A Room or Workflow research can be opened; direct research has no room to open.
    if (!record.workspaceId || (!entry.roomId && !entry.workflowId)) return null;
    const id = (entry.roomId ?? entry.workflowId)!;
    return (
      <Button
        className="ar-btn ar-research-action"
        onClick={() => openDispatch({ kind: entry.roomId ? 'room' : 'workflow', id, workspaceId: record.workspaceId! })}
      >
        {entry.roomId ? 'Open Room' : 'Open Workflow'}
      </Button>
    );
  }
  // Research run directly as one agent shows its own wait, once the run reports.
  if (entry.kind === undefined && entry.runId) {
    return (
      <DirectResearch
        question={entry.question}
        stoppingCondition={entry.stoppingCondition}
        runId={entry.runId}
        startedAt={entry.startedAt}
      />
    );
  }
  return <p className="ar-why">Preparing the research task.</p>;
}

export function ProjectResearch({ record }: { record: ProjectRecord }) {
  const pending = record.pendingResearch ?? [];
  const finished = record.research;
  if (!pending.length && !finished.length) return null;
  return (
    <section aria-label="Research and reviews">
      <SectionHead title="Research and reviews" count={pending.length ? 'in progress' : 'findings ready'} />
      {[...pending, ...finished].map((entry) => (
        <article className="ar-card" key={entry.id}>
          <h3 className="ar-q">{entry.question}</h3>
          <p className="ar-why">{entry.stoppingCondition}</p>
          {entry.models?.map((member) => <p className="ar-why" key={member.name}>{member.name}: {member.model} · {member.thinking} thinking</p>)}
          {'result' in entry && <details className="ar-models"><summary>Findings used for the plan</summary><p className="ar-plan">{entry.result}</p></details>}
          <ResearchStatus entry={entry} record={record} />
        </article>
      ))}
    </section>
  );
}
