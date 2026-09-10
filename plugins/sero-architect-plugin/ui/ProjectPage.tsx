import { useCallback, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { AutonomySetting, ProjectRecord } from '../shared/record';
import type { ActionOutcome, ArchitectActions, SessionHistoryEntry } from './lib/actions';
import { openDispatch } from './lib/page-helpers';
import { CapInput } from './components/CapInput';
import { Directives } from './components/Directives';
import { LimitBanner } from './components/LimitBanner';
import { MilestoneRail } from './components/MilestoneRail';
import { NeedsYou } from './components/NeedsYou';
import { ProjectResearch } from './components/ProjectResearch';
import { RepairCard } from './components/RepairCard';
import { ProjectPreview } from './components/ProjectPreview';
import { SideColumn, type DisclosureState } from './components/SideColumn';
import { SessionHistoryDialog } from './components/SessionHistoryDialog';
import { StateLine } from './components/StateLine';
import { TopBar, type ProjectControls } from './components/TopBar';
import { Quiet, SectionHead } from './components/Pill';

export interface ProjectPageProps {
  permissionPending?: boolean;
  record: ProjectRecord;
  actions: ArchitectActions;
  narrow: boolean;
  disclosures: DisclosureState;
  onBack(): void;
  /** Called before a destructive control runs; returns false to cancel. */
  confirm(message: string): boolean;
}

export function ProjectPage({ record, actions, narrow, disclosures, onBack, confirm, permissionPending = false }: ProjectPageProps) {
  const id = record.id;
  const [notice, setNotice] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const continueSetup = async () => {
    if (settingUp || permissionPending) return;
    setSettingUp(true);
    setNotice(null);
    try {
      const outcome = await actions.resume(id);
      if (!outcome.ok) setNotice(outcome.text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingUp(false);
    }
  };
  const [capOpen, setCapOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionEntries, setSessionEntries] = useState<SessionHistoryEntry[]>([]);

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
      setHistoryOpen(true);
      setHistoryLoading(true);
      setHistoryError(null);
      void actions.history(id).then((outcome) => {
        setSessionEntries(outcome.entries);
        setHistoryError(outcome.ok ? null : outcome.text);
        setHistoryLoading(false);
      });
    },
    // The watcher never pushes null for an unlinked file, so the page leaves on its own.
    remove: () => { if (confirm(`Delete ${record.name}? The record and its owner session are removed. Files in ${record.folder} stay.`)) void report(actions.remove(id), onBack); },
  }), [actions, confirm, id, onBack, record.folder, record.name, report]);

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
          {((notice !== null && notice !== record.blockedReason) || capOpen) && (
            <div className="ar-notice">
              {notice !== null && notice !== record.blockedReason && <p role="alert">{notice}</p>}
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
                  <Quiet>{record.blockedReason ?? 'Allow the Architect to run in this workspace to start planning your project.'}</Quiet>
                  <Button className="mt-3" disabled={settingUp || permissionPending} onClick={() => void continueSetup()}>
                    {settingUp || permissionPending ? 'Waiting for permission…' : record.workspaceId ? 'Request permission' : 'Retry setup'}
                  </Button>
                </section>
              ) : (
                <>
                  <LimitBanner record={record} onRaise={(capUsd) => actions.raiseCap(id, capUsd)} />
                  <NeedsYou record={record} actions={needsActions} />
                  {record.blockedReason && record.milestones.some((item) => item.pendingDispatch) && <RepairCard projectId={id} />}
                </>
              )}
              <ProjectResearch record={record} />
              <MilestoneRail record={record} onOpenDispatch={openDispatch} onRetry={(milestoneId) => actions.retry(id, milestoneId)} />
              {record.phase !== 'intake' && <ProjectPreview projectId={id} />}
              {record.phase === 'intake' && (
                <section>
                  <SectionHead title="Idea" count="verbatim" />
                  <div className="ar-card"><p className="ar-idea">{record.idea}</p></div>
                </section>
              )}
              <Directives record={record} onSend={(text) => actions.directive(id, text)} />
            </div>
            <SideColumn record={record} disclosures={disclosures} />
          </div>
        </div>
      </div>
      <SessionHistoryDialog
        open={historyOpen}
        projectName={record.name}
        entries={sessionEntries}
        loading={historyLoading}
        error={historyError}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
