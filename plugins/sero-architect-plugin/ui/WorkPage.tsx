import { useEffect, useRef } from 'react';
import { relativeTime } from '@sero-ai/common';
import { MessageResponse } from '@sero-ai/ui/ai-elements/message';
import { Compass } from 'lucide-react';

import type { ProjectRecord } from '../shared/record';
import type { ArchitectActions } from './lib/actions';
import { shortTime } from './lib/format';
import { WORK_TABS, type WorkTab } from './lib/navigation';
import { openDispatch } from './lib/page-helpers';
import { useProjectWork } from './lib/use-project-feedback';
import { Evidence } from './components/Evidence';
import { FolderLink } from './components/FolderLink';
import { MilestoneRail } from './components/MilestoneRail';
import { ProjectResearch } from './components/ProjectResearch';
import { TopBar } from './components/TopBar';
import { WaitCard } from './components/WaitCard';
import { WorkLive } from './components/WorkLive';

const TAB_LABEL: Record<WorkTab, string> = { live: 'Live', plan: 'Plan', research: 'Research', evidence: 'Evidence' };

export interface WorkPageProps {
  record: ProjectRecord;
  actions: ArchitectActions;
  runtimeRunning: boolean;
  tab: WorkTab;
  /** A milestone whose evidence opens on arrival, from a History link. */
  focusMilestoneId?: string;
  onTab(tab: WorkTab): void;
  /** Opens the Evidence tab on one milestone's checks. */
  onOpenEvidence(milestoneId: string): void;
  onBack(): void;
  onProject(): void;
  onOpenHistory(): void;
}

function LiveTab({ record, actions, runtimeRunning }: Pick<WorkPageProps, 'record' | 'actions' | 'runtimeRunning'>) {
  const { epoch, work } = useProjectWork(record, actions);
  return (
    <>
      <WaitCard record={record} actions={actions} />
      <WorkLive record={record} work={work} epoch={epoch} runtimeRunning={runtimeRunning} />
    </>
  );
}

/** The full plan: the request as written, what the Architect makes of it, and each step. */
function PlanTab({ record, onOpenHistory, onOpenWork }: Pick<WorkPageProps, 'record' | 'onOpenHistory'> & { onOpenWork(tab: WorkTab, milestoneId: string): void }) {
  const working = record.working;
  const planned = Boolean(working || record.brief || record.milestones.length > 0);
  return (
    <div className="wk-doc">
      <section>
        <h3 className="wk-h">Request</h3>
        <p className="ar-idea">{record.idea}</p>
        <p className="wk-line"><FolderLink folder={record.folder} /></p>
      </section>
      {!planned && <p className="wk-line">Planning is not recorded yet.</p>}
      {working && (
        <section>
          <h3 className="wk-h">Working plan <span className="ar-when">{relativeTime(working.updatedAt)}</span></h3>
          <p>{working.objective}</p>
          {working.approach && <p className="wk-line">{working.approach}</p>}
          {working.criteria.length > 0 && (
            <ul className="wk-criteria">
              {working.criteria.map((criterion) => (
                <li key={criterion.id}>{criterion.text}{criterion.gap && <span className="ar-error"> Not met: {criterion.gap}</span>}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {record.brief && <MessageResponse mode="static" className="ar-document">{record.brief}</MessageResponse>}
      {record.charter?.escalationPolicy && (
        <section>
          <h3 className="wk-h">When Architect asks you</h3>
          <MessageResponse mode="static" className="ar-document">{record.charter.escalationPolicy}</MessageResponse>
        </section>
      )}
      {record.milestones.length > 0 && <MilestoneRail record={record} onOpenDispatch={openDispatch} onOpenWork={onOpenWork} showEvidence={false} />}
      {record.milestones.filter((milestone) => milestone.plan).map((milestone) => (
        <details className="ar-reported" key={milestone.id}>
          <summary>Plan for {milestone.title}</summary>
          <MessageResponse mode="static" className="ar-document">{milestone.plan ?? ''}</MessageResponse>
        </details>
      ))}
      {record.stateLine && (
        <section>
          <h3 className="wk-h">Architect's last report <span className="ar-when">{relativeTime(record.updatedAt)}</span></h3>
          <p>{record.stateLine}</p>
        </section>
      )}
      {record.directives.length > 0 && (
        <section>
          <h3 className="wk-h">Your notes</h3>
          {record.directives.map((directive) => (
            <div key={directive.id}>
              <div className="ar-you"><small>you · {shortTime(directive.sentAt)}</small><p>{directive.text}</p></div>
              {directive.reply && (
                <div className="ar-reply">
                  <span className="ar-av"><Compass className="ar-i" /></span>
                  <div className="ar-rt"><small>architect · {shortTime(directive.reply.repliedAt)}</small><p>{directive.reply.text}</p></div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      <button type="button" className="ar-btn-link" onClick={onOpenHistory}>Open history</button>
    </div>
  );
}

function EvidenceTab({ record, focusMilestoneId }: Pick<WorkPageProps, 'record' | 'focusMilestoneId'>) {
  const focusRef = useRef<HTMLElement>(null);
  // Scrolling to the linked check and opening it are DOM effects, not state.
  useEffect(() => {
    const node = focusRef.current;
    if (!node) return;
    node.scrollIntoView?.({ block: 'start' });
    const evidence = node.querySelector<HTMLDetailsElement>('details.ar-evidence');
    if (evidence) evidence.open = true;
  }, [focusMilestoneId]);
  const checked = record.milestones.filter((milestone) => milestone.evidence);
  if (checked.length === 0) return <p className="wk-line">No checks are recorded yet.</p>;
  return (
    <div className="wk-doc">
      {checked.map((milestone) => (
        <section key={milestone.id} ref={milestone.id === focusMilestoneId ? focusRef : undefined} data-milestone={milestone.id}>
          <h3 className="wk-h">{milestone.title}</h3>
          {milestone.evidence && <Evidence evidence={milestone.evidence} projectId={record.id} />}
        </section>
      ))}
    </div>
  );
}

/**
 * The work behind the overview: what runs now, the full plan, the research and
 * the checks. The overview stays short because everything long lives here.
 */
export function WorkPage({ record, actions, runtimeRunning, tab, focusMilestoneId, onTab, onOpenEvidence, onBack, onProject, onOpenHistory }: WorkPageProps) {
  const researched = record.research.length > 0 || (record.pendingResearch ?? []).length > 0;
  return (
    <>
      <TopBar record={record} controls={null} onBack={onBack} onNewProject={() => undefined} leaf="Work" onProject={onProject} />
      <div className="ar-scroll">
        <div className="ar-body">
          <div className="wk-tabs" role="tablist" aria-label="Work">
            {WORK_TABS.map((id) => (
              <button key={id} type="button" role="tab" id={`wk-tab-${id}`} aria-selected={tab === id} aria-controls="wk-panel" onClick={() => onTab(id)}>{TAB_LABEL[id]}</button>
            ))}
          </div>
          <div role="tabpanel" id="wk-panel" aria-labelledby={`wk-tab-${tab}`}>
            {tab === 'live' && <LiveTab record={record} actions={actions} runtimeRunning={runtimeRunning} />}
            {tab === 'plan' && <PlanTab record={record} onOpenHistory={onOpenHistory} onOpenWork={(next, milestoneId) => (next === 'evidence' ? onOpenEvidence(milestoneId) : onTab(next))} />}
            {tab === 'research' && (researched ? <ProjectResearch record={record} /> : <p className="wk-line">No research is recorded.</p>)}
            {tab === 'evidence' && <EvidenceTab record={record} focusMilestoneId={focusMilestoneId} />}
          </div>
        </div>
      </div>
    </>
  );
}
