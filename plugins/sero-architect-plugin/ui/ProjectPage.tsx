import { useCallback, useMemo, useState } from 'react';
import { openSeroFile } from '@sero-ai/app-runtime';

import type { AutonomySetting, ProjectRecord } from '../shared/record';
import type { ActionOutcome, ArchitectActions } from './lib/actions';
import { openDispatch } from './lib/page-helpers';
import { CapInput } from './components/CapInput';
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
  const [notice, setNotice] = useState<string | null>(null);
  const [capOpen, setCapOpen] = useState(false);

  /** A control that is refused must say so: the record alone never shows the refusal. */
  const report = useCallback(async (outcome: Promise<ActionOutcome>, onOk?: () => void) => {
    const result = await outcome;
    setNotice(result.ok ? null : result.text);
    if (result.ok) onOk?.();
  }, []);

  const controls = useMemo<ProjectControls>(() => ({
    pause: () => void report(actions.pause(id)),
    resume: () => void report(actions.resume(id)),
    stop: () => { if (confirm(`Stop ${record.name}? Running work finishes on its own; the Architect is not woken again.`)) void report(actions.stop(id)); },
    raiseCap: () => { setNotice(null); setCapOpen(true); },
    setAutonomy: (next: AutonomySetting) => void report(actions.setAutonomy(id, next)),
    openSession: () => {
      if (record.workspaceId && record.session.sessionPath) void openSeroFile(record.workspaceId, record.session.sessionPath);
    },
    // The watcher never pushes null for an unlinked file, so the page leaves on its own.
    remove: () => { if (confirm(`Delete ${record.name}? The record and its owner session are removed. Files in ${record.folder} stay.`)) void report(actions.remove(id), onBack); },
  }), [actions, confirm, id, onBack, record.folder, record.name, record.session.sessionPath, record.workspaceId, report]);

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
          {(notice !== null || capOpen) && (
            <div className="ar-notice">
              {notice !== null && <p role="alert">{notice}</p>}
              {capOpen && (
                <CapInput
                  cap={record.budget.capUsd}
                  inputId="ar-raise-cap-in"
                  submitLabel="Raise cap"
                  onRaise={(capUsd) => actions.raiseCap(id, capUsd)}
                  onError={setNotice}
                  onDone={() => setCapOpen(false)}
                />
              )}
            </div>
          )}
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
