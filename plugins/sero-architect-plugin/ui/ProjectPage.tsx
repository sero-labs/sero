import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@sero-ai/ui';

import { sessionStartedAt } from '@sero-ai/common';
import { projectActivity } from '../shared/activity';
import type { AutonomySetting, Milestone, ProjectRecord } from '../shared/record';
import type { ActionOutcome, ArchitectActions, SessionHistoryEntry } from './lib/actions';
import { openDispatch, type Disclosures } from './lib/page-helpers';
import { CapInput, type CapInputProps } from './components/CapInput';
import { DirectiveComposer, Directives } from './components/Directives';
import { MilestoneRail } from './components/MilestoneRail';
import { NeedsYou } from './components/NeedsYou';
import { ProjectResearch } from './components/ProjectResearch';
import { RepairCard } from './components/RepairCard';
import { ProjectPreview } from './components/ProjectPreview';
import { RetryWorkflowControl } from './components/RetryWorkflowControl';
import { SideColumn } from './components/SideColumn';
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
  disclosures: Disclosures;
  onBack(): void;
  /** Opens the project model defaults view. */
  onOpenModels(): void;
  /** Opens the run inspector. */
  onOpenInspector(): void;
  /** Opens the project's History view. */
  onOpenHistory(): void;
  /** The milestone whose evidence opens on arrival, from a History link. */
  focusMilestoneId?: string;
  /** Called before a destructive control runs; returns false to cancel. */
  confirm(message: string): boolean;
}

function useProjectPageControls(record: ProjectRecord, actions: ArchitectActions, onBack: () => void, confirm: (message: string) => boolean, onOpenModels: () => void, onOpenInspector: () => void, onOpenHistory: () => void) {
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
    openHistory: onOpenHistory,
    // The watcher never pushes null for an unlinked file, so the page leaves on its own.
    remove: () => { if (confirm(`Delete ${record.name}? The record and its owner session are removed. Files in ${record.folder} stay.`)) void report(actions.remove(id), onBack); },
  }), [actions, confirm, id, onBack, onOpenModels, onOpenInspector, onOpenHistory, record.folder, record.name, report]);

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

function ProjectMainColumn({ record, actions, needsActions, permissionPending, onNotice, focusMilestoneId }: {
  record: ProjectRecord;
  actions: ArchitectActions;
  needsActions: ReturnType<typeof useProjectPageControls>['needsActions'];
  permissionPending: boolean;
  onNotice(notice: string | null): void;
  focusMilestoneId?: string;
}) {
  const id = record.id;
  return (
    <div className="ar-col">
      {record.phase === 'intake' ? (
        <IntakeSetup record={record} actions={actions} permissionPending={permissionPending} onNotice={onNotice} />
      ) : (
        <>
          <NeedsYou record={record} actions={needsActions} />
          {record.blockedReason && record.milestones.some((item) => item.pendingDispatch) && <RepairCard projectId={id} />}
        </>
      )}
      <ProjectResearch record={record} />
      <MilestoneRail record={record} onOpenDispatch={openDispatch} focusMilestoneId={focusMilestoneId} />
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
 * What the header offers, and what each control runs.
 *
 * Each is the same action the rest of the page already has, so nothing is only
 * reachable here: the recovery controls the milestone row used to carry now sit
 * in the header, and "Tell Architect what to do next" puts the cursor in the
 * directive box at the foot of the page rather than sending anything itself.
 */
function useHeaderActions(
  record: ProjectRecord,
  runtimeRunning: boolean,
  focusDirective: () => void,
): HeaderAction[] {
  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning });

  // A cap is not a button: it needs a number, so the header carries the field
  // instead and this returns nothing for it.
  if (activity.action === 'Raise the cap') return [];
  if (cappedWorkflow(record)) return [];

  // Delegated work that stopped without reporting. The Room is worth opening,
  // and the Architect needs telling what to do instead.
  const blocked = record.blockedOn;
  if (blocked && record.workspaceId) {
    const { kind, id, workspaceId } = { ...blocked, workspaceId: record.workspaceId };
    return [
      { label: kind === 'room' ? 'Open Room' : 'Open Workflow', primary: true, run: () => openDispatch({ kind, id, workspaceId }) },
      { label: 'Tell Architect what to do next', run: focusDirective },
    ];
  }

  if (!activity.action) return [];

  // A stopped dispatch's recovery is the header's OWN control, not a button
  // here. A cap needs a field to type in, and no cap needs the busy state and
  // the refusal — neither of which a bare action can show. `ProjectPage`
  // renders it in the `form` slot; this returns nothing so it appears once.
  if (record.milestones.some((milestone) => milestone.dispatch?.failure)) return [];

  const room = record.milestones.find((milestone) => milestone.dispatch?.kind === 'room' && milestone.dispatch.failure);
  if (activity.action === 'Open the Room to answer' && room?.dispatch) {
    const { kind, id, workspaceId } = room.dispatch;
    return [{ label: 'Open Room to answer', primary: true, run: () => openDispatch({ kind, id, workspaceId }) }];
  }
  // An open decision keeps its control: the Needs You card sits right under
  // this header with its answer, so a second button would be the same one twice.
  return [];
}

/**
 * A dispatched milestone that stopped at its OWN cap.
 *
 * Its recovery needs a new number before the Workflow can resume, so its control
 * is a field rather than a button — the same shape the project's own cap needs.
 */
function cappedWorkflow(record: ProjectRecord): Milestone | undefined {
  return record.milestones.find(
    (item) => item.dispatch?.failure && item.dispatch.costLimitUsd !== undefined,
  );
}

export function ProjectPage({ record, actions, narrow, disclosures, onBack, onOpenModels, onOpenInspector, onOpenHistory, focusMilestoneId, confirm, runtimeRunning, permissionPending = false }: ProjectPageProps) {
  const id = record.id;
  const page = useProjectPageControls(record, actions, onBack, confirm, onOpenModels, onOpenInspector, onOpenHistory);
  // Focusing a node is an external side effect, so it is a ref and a call, not
  // derived state. The header's "Tell Architect what to do next" runs it.
  const directiveRef = useRef<HTMLTextAreaElement>(null);
  // Focusing the box scrolls it into view on its own, so there is nothing else
  // to do here.
  const focusDirective = useCallback(() => directiveRef.current?.focus(), []);
  const headerActions = useHeaderActions(record, runtimeRunning, focusDirective);
  // At the cap the header carries the field, because raising it needs a number
  // rather than a confirmation. The same action stays in the project menu.
  const atCap = record.overlay === 'limited' && record.budget.capUsd !== null;
  // A dispatch that stopped at its own cap needs a number too. Both cases are
  // one field with different wording and target, so they are built together.
  const cappedMilestone = cappedWorkflow(record);
  const workflowCap = cappedMilestone?.dispatch?.costLimitUsd;
  let capForm: Omit<CapInputProps, 'onError' | 'onDone'> | null = null;
  if (atCap) {
    capForm = {
      cap: record.budget.capUsd,
      inputId: 'ar-header-cap-in',
      label: 'New cap',
      submitLabel: 'Raise and resume',
      onRaise: (capUsd) => actions.raiseCap(id, capUsd),
    };
  } else if (cappedMilestone && workflowCap !== undefined) {
    capForm = {
      cap: workflowCap,
      inputId: 'ar-header-wf-cap-in',
      label: 'New Workflow cap',
      submitLabel: 'Approve cap and resume',
      onRaise: (capUsd) => actions.retry(id, cappedMilestone.id, capUsd),
    };
  }

  // A dispatch that stopped with NO cap to approve: a time limit clears the step
  // id, so there is no step to retry from and the whole Workflow restarts. The
  // milestone row carried this control before it moved; without it here the
  // recovery is unreachable, which is the fault this shape exists to prevent.
  const stoppedWorkflow = record.milestones.find(
    (item) => item.dispatch?.failure && item.dispatch.costLimitUsd === undefined,
  );
  let headerForm: ReactNode;
  if (capForm) {
    headerForm = <CapInput {...capForm} onError={page.setNotice} onDone={() => page.setNotice(null)} />;
  } else if (stoppedWorkflow) {
    headerForm = (
      <RetryWorkflowControl
        label={stoppedWorkflow.dispatch?.retryStepId ? 'Retry step' : 'Restart the Workflow'}
        retry={() => actions.retry(id, stoppedWorkflow.id)}
        onError={page.setNotice}
      />
    );
  }

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
          <StateLine
            record={record}
            home={null}
            actions={headerActions}
            form={headerForm}
            runtimeRunning={runtimeRunning}
          />
          <div className="ar-sections" data-narrow={narrow ? 1 : 0}>
            <ProjectMainColumn record={record} actions={actions} needsActions={page.needsActions} permissionPending={permissionPending} onNotice={page.setNotice} focusMilestoneId={focusMilestoneId} />
            <SideColumn record={record} disclosures={disclosures} />
          </div>
        </div>
      </div>
      <div className="ar-dock">
        <DirectiveComposer
          disabled={record.phase === 'intake'}
          inputRef={directiveRef}
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
