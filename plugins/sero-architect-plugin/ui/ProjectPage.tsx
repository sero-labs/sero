import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@sero-ai/ui';
import { ChevronRight, ExternalLink, Eye } from 'lucide-react';

import { sessionStartedAt, type FeedbackSummary } from '@sero-ai/common';
import { useProjectFeedback } from './lib/use-project-feedback';
import { projectActivity } from '../shared/activity';
import type { AutonomySetting, Milestone, ProjectRecord } from '../shared/record';
import type { ActionOutcome, ArchitectActions, SessionHistoryEntry } from './lib/actions';
import { openDispatch, type Disclosures } from './lib/page-helpers';
import { CapInput, type CapInputProps } from './components/CapInput';
import { DirectiveComposer } from './components/Directives';
import { NeedsYou } from './components/NeedsYou';
import { RepairCard } from './components/RepairCard';
import { PreviewFrame } from './components/PreviewFrame';
import { useProjectPreview } from './lib/use-project-preview';
import { agreementApproved, hasAgreement } from '../shared/agreement';
import type { WorkTab } from './lib/navigation';
import { RetryWorkflowControl } from './components/RetryWorkflowControl';
import { SessionHistoryDialog } from './components/SessionHistoryDialog';
import { StateLine, type HeaderAction } from './components/StateLine';
import { TopBar, type ProjectControls } from './components/TopBar';

export interface ProjectPageProps {
  permissionPending?: boolean;
  record: ProjectRecord;
  /** Whether the Architect runtime is running in this session. */
  runtimeRunning: boolean;
  actions: ArchitectActions;
  onBack(): void;
  /** Opens the project model defaults view. */
  onOpenModels(): void;
  /** Opens the run inspector. */
  onOpenInspector(): void;
  /** Opens the project's History view. */
  onOpenHistory(): void;
  /** Opens the work behind the overview, on one of its tabs. */
  onOpenWork(tab: WorkTab): void;
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
    enableOpenSpec: () => void report(actions.enableOpenSpec(id)),
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
  feedback: FeedbackSummary | null,
  reviewAccess: (() => void) | null,
): HeaderAction[] {
  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning, feedback });

  // The start approval is the host's own question. This raises it again; while
  // it is already on screen there is nothing to press.
  if (activity.action === 'Review access') return reviewAccess ? [{ label: 'Review access', primary: true, run: reviewAccess }] : [];

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

/** The state header and the control that recovers its cap or Workflow. */
function ProjectStateHeader({ record, actions, onNotice, headerActions, runtimeRunning, feedback, links }: {
  links: ReactNode;
  feedback: FeedbackSummary | null;
  record: ProjectRecord;
  actions: ArchitectActions;
  onNotice(notice: string | null): void;
  headerActions: HeaderAction[];
  runtimeRunning: boolean;
}) {
  const id = record.id;
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
  let form: ReactNode;
  if (capForm) {
    form = <CapInput {...capForm} onError={onNotice} onDone={() => onNotice(null)} />;
  } else if (stoppedWorkflow) {
    form = (
      <RetryWorkflowControl
        label={stoppedWorkflow.dispatch?.retryStepId ? 'Retry step' : 'Restart the Workflow'}
        retry={() => actions.retry(id, stoppedWorkflow.id)}
        onError={onNotice}
      />
    );
  }
  return <StateLine record={record} actions={headerActions} form={form} runtimeRunning={runtimeRunning} feedback={feedback} links={links} />;
}

export function ProjectPage({ record, actions, onBack, onOpenModels, onOpenInspector, onOpenHistory, onOpenWork, confirm, runtimeRunning, permissionPending = false }: ProjectPageProps) {
  const id = record.id;
  const page = useProjectPageControls(record, actions, onBack, confirm, onOpenModels, onOpenInspector, onOpenHistory);
  const directiveRef = useRef<HTMLTextAreaElement>(null);
  const focusDirective = useCallback(() => directiveRef.current?.focus(), []);
  const feedback = useProjectFeedback(record, actions);
  const headerActions = useHeaderActions(record, runtimeRunning, focusDirective, feedback, permissionPending ? null : page.controls.resume);
  const preview = useProjectPreview(id);
  // Before the start is approved there is no work to watch and nothing to note.
  const started = !hasAgreement(record) ? record.phase !== 'intake' : agreementApproved(record);
  const checked = record.milestones.some((milestone) => milestone.evidence);
  const links = started && (
    <>
      <Button size="sm" variant="outline" className="ar-btn" disabled={preview.busy} onClick={() => void preview.open()}>
        <ExternalLink className="ar-i" />{preview.busy ? 'Starting preview…' : 'Open preview'}
      </Button>
      <Button size="sm" variant="outline" className="ar-btn" onClick={() => onOpenWork('live')}><Eye className="ar-i" />Watch work</Button>
      {checked && <button type="button" className="ar-btn-link" onClick={() => onOpenWork('evidence')}>Evidence<ChevronRight className="ar-i" /></button>}
    </>
  );

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
          <ProjectStateHeader
            record={record}
            actions={actions}
            onNotice={page.setNotice}
            headerActions={headerActions}
            runtimeRunning={runtimeRunning}
            feedback={feedback}
            links={links}
          />
          {preview.error && <p role="alert" className="ar-error">{preview.error}</p>}
          {preview.url && <PreviewFrame url={preview.url} />}
          {started && <NeedsYou record={record} actions={page.needsActions} onOpenWork={onOpenWork} />}
          {record.blockedReason && record.milestones.some((item) => item.pendingDispatch) && <RepairCard projectId={id} />}
        </div>
      </div>
      <div className="ar-dock">
        {record.overview?.acknowledgement && <p className="ar-ack" role="status">{record.overview.acknowledgement.text}</p>}
        <DirectiveComposer
          disabled={!started}
          inputRef={directiveRef}
          onSend={(text) => actions.directive(id, text)}
          onRequestChange={record.openSpecEnabled && record.phase === 'maintain' ? (text) => actions.requestChange(id, text) : undefined}
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
