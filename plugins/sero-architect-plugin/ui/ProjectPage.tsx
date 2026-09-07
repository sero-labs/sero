import { useMemo } from 'react';
import { openSeroFile } from '@sero-ai/app-runtime';

import type { AutonomySetting, ProjectRecord } from '../shared/record';
import type { ArchitectActions } from './lib/actions';
import { openDispatch } from './lib/page-helpers';
import { Directives } from './components/Directives';
import { LimitBanner } from './components/LimitBanner';
import { MilestoneRail } from './components/MilestoneRail';
import { NeedsYou } from './components/NeedsYou';
import { SideColumn, type DisclosureState } from './components/SideColumn';
import { StateLine } from './components/StateLine';
import { TopBar, type ProjectControls } from './components/TopBar';
import { Quiet, SectionHead } from './components/Pill';

export interface ProjectPageProps {
  record: ProjectRecord;
  actions: ArchitectActions;
  narrow: boolean;
  disclosures: DisclosureState;
  onBack(): void;
  /** Called before a destructive control runs; returns false to cancel. */
  confirm(message: string): boolean;
}

export function ProjectPage({ record, actions, narrow, disclosures, onBack, confirm }: ProjectPageProps) {
  const id = record.id;

  const controls = useMemo<ProjectControls>(() => ({
    pause: () => void actions.pause(id),
    resume: () => void actions.resume(id),
    stop: () => { if (confirm(`Stop ${record.name}? Running work finishes on its own; the Architect is not woken again.`)) void actions.stop(id); },
    raiseCap: () => {
      const current = record.budget.capUsd ?? 0;
      const answer = window.prompt(`New cost cap in USD (currently $${current})`, String(Math.ceil((current + 20) / 10) * 10));
      const next = Number(answer);
      if (answer !== null && Number.isFinite(next) && next > current) void actions.raiseCap(id, next);
    },
    setAutonomy: (next: AutonomySetting) => void actions.setAutonomy(id, next),
    openSession: () => {
      if (record.workspaceId && record.session.sessionPath) void openSeroFile(record.workspaceId, record.session.sessionPath);
    },
    remove: () => { if (confirm(`Delete ${record.name}? The record and its owner session are removed. Files in ${record.folder} stay.`)) void actions.remove(id); },
  }), [actions, confirm, id, record.budget.capUsd, record.folder, record.name, record.session.sessionPath, record.workspaceId]);

  const needsActions = useMemo(() => ({
    answer: (decisionId: string, optionId: string, note: string) => actions.answer(id, decisionId, optionId, note),
    approveCharter: () => actions.approveCharter(id),
    approveMilestone: (milestoneId: string) => actions.approveMilestone(id, milestoneId),
  }), [actions, id]);

  return (
    <>
      <TopBar record={record} controls={controls} onBack={onBack} onNewProject={() => undefined} />
      <div className="ar-scroll">
        <div className="ar-body">
          <StateLine record={record} home={null} />
          <div className="ar-sections" data-narrow={narrow ? 1 : 0}>
            <div className="ar-col">
              {record.phase === 'intake' ? (
                <section>
                  <SectionHead title="Setting up" count={record.blockedReason ? 'waiting' : 'in progress'} />
                  <Quiet>{record.blockedReason ?? 'Creating the folder, initialising the repository, registering the workspace, then asking for the session grant.'}</Quiet>
                </section>
              ) : (
                <>
                  <LimitBanner record={record} onRaise={(capUsd) => actions.raiseCap(id, capUsd)} />
                  <NeedsYou record={record} actions={needsActions} />
                </>
              )}
              <MilestoneRail record={record} onOpenDispatch={openDispatch} />
              {record.phase === 'intake' && (
                <section>
                  <SectionHead title="Idea" count="verbatim" />
                  <div className="ar-card"><p className="ar-idea">{record.idea}</p></div>
                </section>
              )}
              <Directives record={record} onSend={(text) => actions.directive(id, text)} />
            </div>
            {!narrow && <SideColumn record={record} disclosures={disclosures} />}
          </div>
        </div>
      </div>
    </>
  );
}
