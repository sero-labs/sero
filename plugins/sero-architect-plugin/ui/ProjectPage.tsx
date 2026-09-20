import { useCallback, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';

import { sessionStartedAt } from '@sero-ai/common';
import { projectActivity } from '../shared/activity';
import type { AutonomySetting, ProjectRecord } from '../shared/record';
import type { ActionOutcome, ArchitectActions, SessionHistoryEntry } from './lib/actions';
import { openDispatch } from './lib/page-helpers';
import { CapInput } from './components/CapInput';
import { DirectiveComposer, Directives } from './components/Directives';
import { LimitBanner } from './components/LimitBanner';
import { MilestoneRail } from './components/MilestoneRail';
import { NeedsYou } from './components/NeedsYou';
import { ProjectResearch } from './components/ProjectResearch';
import { RepairCard } from './components/RepairCard';
import { ProjectPreview } from './components/ProjectPreview';
import { SideColumn, type DisclosureState } from './components/SideColumn';
import { SessionHistoryDialog } from './components/SessionHistoryDialog';
import { StateLine, type HeaderAction } from './components/StateLine';
import { TopBar, type ProjectControls } from './components/TopBar';
import { Quiet, SectionHead } from './components/Pill';

export interface ProjectPageProps {
  permissionPending?: boolean;
  record: ProjectRecord;
  /** Whether the Architect runtime is running in this session. */
  runtimeRunning: boolean;
  actions: ArchitectActions;
  narrow: boolean;
  disclosures: DisclosureState;
  onBack(): void;
  /** Opens the project model defaults view. */
  onOpenModels(): void;
  /** Opens the run inspector. */
  onOpenInspector(): void;
  /** Called before a destructive control runs; returns false to cancel. */
  confirm(message: string): boolean;
}

function useProjectPageControls(record: ProjectRecord, actions: ArchitectActions, onBack: () => void, confirm: (message: string) => boolean, onOpenModels: () => void, onOpenInspector: () => void) {
  const id = record.id;
  const [notice, setNotice] = useState<string | null>(null);
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
    setExecutionMode: (next) => void report(actions.setExecutionMode(id, next)),
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
    openModels: onOpenModels,
    openInspector: onOpenInspector,
    // The watcher never pushes null for an unlinked file, so the page leaves on its own.
    remove: () => { if (confirm(`Delete ${record.name}? The record and its owner session are removed. Files in ${record.folder} stay.`)) void report(actions.remove(id), onBack); },
  }), [actions, confirm, id, onBack, onOpenModels, onOpenInspector, record.folder, record.name, report]);

  const needsActions = useMemo(() => ({
    answer: (decisionId: string, optionId: string, note: string) => actions.answer(id, decisionId, optionId, note),
    approveCharter: () => actions.approveCharter(id),
    approveMilestone: (milestoneId: string) => actions.approveMilestone(id, milestoneId),
  }), [actions, id]);

  return {
    capOpen,
    controls,
    historyError,
    historyLoading,
    historyOpen,
    needsActions,
    notice,
    sessionEntries,
    setCapOpen,
    setHistoryOpen,
    setNotice,
  };
}

function IntakeSetup({ record, actions, permissionPending, onNotice }: {
  record: ProjectRecord;
  actions: ArchitectActions;
  permissionPending: boolean;
  onNotice(notice: string | null): void;
}) {
  const [settingUp, setSettingUp] = useState(false);
  const continueSetup = async () => {
    if (settingUp || permissionPending) return;
    setSettingUp(true);
    onNotice(null);
    try {
      const outcome = await actions.resume(record.id);
      if (!outcome.ok) onNotice(outcome.text);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingUp(false);
    }
  };
  return (
    <section>
      <SectionHead title="Setting up" count={record.blockedReason ? 'waiting' : 'in progress'} />
      <Quiet>{record.blockedReason ?? 'Allow the Architect to run in this workspace to start planning your project.'}</Quiet>
      <Button className="mt-3" disabled={settingUp || permissionPending} onClick={() => void continueSetup()}>
        {settingUp || permissionPending ? 'Waiting for permission…' : record.workspaceId ? 'Request permission' : 'Retry setup'}
      </Button>
    </section>
  );
}

function ProjectMainColumn({ record, actions, needsActions, permissionPending, onNotice }: {
  record: ProjectRecord;
  actions: ArchitectActions;
  needsActions: ReturnType<typeof useProjectPageControls>['needsActions'];
  permissionPending: boolean;
  onNotice(notice: string | null): void;
}) {
  const id = record.id;
  return (
    <div className="ar-col">
      {record.phase === 'intake' ? (
        <IntakeSetup record={record} actions={actions} permissionPending={permissionPending} onNotice={onNotice} />
      ) : (
        <>
          <LimitBanner record={record} onRaise={(capUsd) => actions.raiseCap(id, capUsd)} />
          <NeedsYou record={record} actions={needsActions} />
          {record.blockedReason && record.milestones.some((item) => item.pendingDispatch) && <RepairCard projectId={id} />}
        </>
      )}
      <ProjectResearch record={record} />
      <MilestoneRail record={record} onOpenDispatch={openDispatch} onRetry={(milestoneId, capUsd) => actions.retry(id, milestoneId, capUsd)} />
      {record.phase !== 'intake' && <ProjectPreview projectId={id} />}
      {record.phase === 'intake' && (
        <section>
          <SectionHead title="Idea" count="verbatim" />
          <div className="ar-card"><p className="ar-idea">{record.idea}</p></div>
        </section>
      )}
      <Directives record={record} />
    </div>
  );
}

/**
 * The one action the header offers, and what it runs.
 *
 * It is the same action the projects list names, so a user reading either sees
 * one thing to do. Retry step is lifted here from the milestone rail: both
 * start the same retry.
 */
function useHeaderAction(
  record: ProjectRecord,
  actions: ArchitectActions,
  runtimeRunning: boolean,
  raiseCap: () => void,
): HeaderAction | null {
  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning });
  if (!activity.action) return null;
  const stopped = record.milestones.find((milestone) => milestone.dispatch?.failure && milestone.dispatch.retryStepId);
  if (activity.action === 'Retry the step' && stopped) {
    return { label: 'Retry step', run: () => void actions.retry(record.id, stopped.id) };
  }
  if (activity.action === 'Raise the cap') {
    return { label: 'Raise the cap', run: raiseCap };
  }
  const room = record.milestones.find((milestone) => milestone.dispatch?.kind === 'room' && milestone.dispatch.failure);
  if (activity.action === 'Open the Room to answer' && room?.dispatch) {
    const { kind, id, workspaceId } = room.dispatch;
    return { label: 'Open Room to answer', run: () => openDispatch({ kind, id, workspaceId }) };
  }
  // An open decision keeps its control: the Needs You card sits right under
  // this header with its answer, so a second button would be the same one twice.
  return null;
}

export function ProjectPage({ record, actions, narrow, disclosures, onBack, onOpenModels, onOpenInspector, confirm, runtimeRunning, permissionPending = false }: ProjectPageProps) {
  const id = record.id;
  const page = useProjectPageControls(record, actions, onBack, confirm, onOpenModels, onOpenInspector);
  const headerAction = useHeaderAction(record, actions, runtimeRunning, page.controls.raiseCap);

  return (
    <>
      <TopBar record={record} controls={page.controls} onBack={onBack} onNewProject={() => undefined} />
      <div className="ar-scroll">
        <div className="ar-body">
          {((page.notice !== null && page.notice !== record.blockedReason) || page.capOpen) && (
            <div className="ar-notice">
              {page.notice !== null && page.notice !== record.blockedReason && <p role="alert">{page.notice}</p>}
              {page.capOpen && (
                <CapInput
                  cap={record.budget.capUsd}
                  inputId="ar-raise-cap-in"
                  submitLabel="Raise cap"
                  onRaise={(capUsd) => actions.raiseCap(id, capUsd)}
                  onError={page.setNotice}
                  onDone={() => page.setCapOpen(false)}
                />
              )}
            </div>
          )}
          <StateLine record={record} home={null} action={headerAction} runtimeRunning={runtimeRunning} />
          <div className="ar-sections" data-narrow={narrow ? 1 : 0}>
            <ProjectMainColumn record={record} actions={actions} needsActions={page.needsActions} permissionPending={permissionPending} onNotice={page.setNotice} />
            <SideColumn record={record} disclosures={disclosures} />
          </div>
        </div>
      </div>
      <div className="ar-dock">
        <DirectiveComposer
          disabled={record.phase === 'intake'}
          onSend={(text) => actions.directive(id, text)}
        />
      </div>
      <SessionHistoryDialog
        open={page.historyOpen}
        projectName={record.name}
        entries={page.sessionEntries}
        loading={page.historyLoading}
        error={page.historyError}
        onClose={() => page.setHistoryOpen(false)}
      />
    </>
  );
}
