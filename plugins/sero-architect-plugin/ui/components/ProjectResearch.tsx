import { Button } from '@sero-ai/ui';
import type { ProjectRecord } from '../../shared/record';
import { openDispatch } from '../lib/page-helpers';
import { SectionHead } from './Pill';

export function ProjectResearch({ record }: { record: ProjectRecord }) {
  const pending = (record.pendingResearch ?? []).filter((entry) => entry.kind);
  const finished = record.research.filter((entry) => entry.roomId || entry.workflowId);
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
          {(entry.roomId || entry.workflowId) && record.workspaceId ? <Button className="ar-btn ar-research-action" onClick={() => openDispatch({ kind: entry.roomId ? 'room' : 'workflow', id: (entry.roomId ?? entry.workflowId)!, workspaceId: record.workspaceId! })}>{entry.roomId ? 'Open Room' : 'Open Workflow'}</Button> : <p className="ar-why">Preparing the research task.</p>}
        </article>
      ))}
    </section>
  );
}
