import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@sero-ai/ui';

import { sessionStartedAt, type FeedbackSummary } from '@sero-ai/common';
import { useProjectFeedback, useProjectWork } from './lib/use-project-feedback';
import { projectActivity } from '../shared/activity';
import type { AutonomySetting, Milestone, ProjectRecord } from '../shared/record';
import type { ActionOutcome, ArchitectActions, SessionHistoryEntry } from './lib/actions';
import { boardOf, liveRows, rowAction, type Board, type BoardStep, type LiveRow, type MadeRow } from './lib/board';
import { openDispatch } from './lib/page-helpers';
import { BoardAsk, BoardHero, BoardMade, BoardPlan, BoardResult, BoardStopped, ProofPicture } from './components/Board';
import { BoardLive } from './components/BoardLive';
import { CapInput } from './components/CapInput';
import { DirectiveComposer } from './components/Directives';
import { RepairCard } from './components/RepairCard';
import { PreviewFrame } from './components/PreviewFrame';
import { usePreviewAvailable, useProjectPreview } from './lib/use-project-preview';
import { agreementApproved, hasAgreement } from '../shared/agreement';
import type { WorkTab } from './lib/navigation';
import { RetryWorkflowControl } from './components/RetryWorkflowControl';
import { SessionHistoryDialog } from './components/SessionHistoryDialog';
import { TopBar, type ProjectControls } from './components/TopBar';
import { WaitCard } from './components/WaitCard';
import { waitCard } from './lib/wait-status';

/** A control a stop offers. At most one is the action the state is really asking for. */
interface HeaderAction {
  label: string;
  run(): void;
  primary?: boolean;
}

export interface ProjectPageProps {
  permissionPending?: boolean;
  /** Why the start that followed intake did not happen, until a later action replaces it. */
  startRefusal?: string | null;
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

  return activity.action ? recoveryActions(record, activity.action, reviewAccess) : [];
}

/** The control for a project that stopped and names what recovers it. */
function recoveryActions(record: ProjectRecord, action: string, reviewAccess: (() => void) | null): HeaderAction[] {
  // A stopped dispatch's recovery is the header's OWN control, not a button
  // here. A cap needs a field to type in, and no cap needs the busy state and
  // the refusal — neither of which a bare action can show. `ProjectPage`
  // renders it in the `form` slot; this returns nothing so it appears once.
  if (record.milestones.some((milestone) => milestone.dispatch?.failure)) return [];

  // The Architect stopped and says to resume. The control it names is here, not
  // only in the menu.
  if (record.blockedReason) return reviewAccess ? [{ label: 'Resume', primary: true, run: reviewAccess }] : [];

  const room = record.milestones.find((milestone) => milestone.dispatch?.kind === 'room' && milestone.dispatch.failure);
  if (action === 'Open the Room to answer' && room?.dispatch) {
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

/** The control a stop needs before work can go on: a new cap, or the step to run again. */
function recoveryForm(record: ProjectRecord, actions: ArchitectActions, onNotice: (notice: string | null) => void): ReactNode {
  const id = record.id;
  // At the cap the tile carries the field, because raising it needs a number
  // rather than a confirmation. The same action stays in the project menu.
  const atCap = record.overlay === 'limited' && record.budget.capUsd !== null;
  // A dispatch that stopped at its own cap needs a number too.
  const cappedMilestone = cappedWorkflow(record);
  const workflowCap = cappedMilestone?.dispatch?.costLimitUsd;
  if (atCap) {
    return <CapInput cap={record.budget.capUsd} inputId="ar-header-cap-in" label="New cap" submitLabel="Raise and resume" onRaise={(capUsd) => actions.raiseCap(id, capUsd)} onError={onNotice} onDone={() => onNotice(null)} />;
  }
  if (cappedMilestone && workflowCap !== undefined) {
    return <CapInput cap={workflowCap} inputId="ar-header-wf-cap-in" label="New Workflow cap" submitLabel="Approve cap and resume" onRaise={(capUsd) => actions.retry(id, cappedMilestone.id, capUsd)} onError={onNotice} onDone={() => onNotice(null)} />;
  }
  // A dispatch that stopped with NO cap to approve: a time limit clears the step
  // id, so there is no step to retry from and the whole Workflow restarts.
  const stoppedWorkflow = record.milestones.find((item) => item.dispatch?.failure && item.dispatch.costLimitUsd === undefined);
  if (!stoppedWorkflow) return null;
  return <RetryWorkflowControl label={stoppedWorkflow.dispatch?.retryStepId ? 'Retry step' : 'Restart the Workflow'} retry={() => actions.retry(id, stoppedWorkflow.id)} onError={onNotice} />;
}

/** What the last action said, and the cap field while it is open. The block reason has its own place. */
function PageNotice({ record, actions, notice, page }: { record: ProjectRecord; actions: ProjectPageProps['actions']; notice: string | null; page: ReturnType<typeof useProjectPageControls> }) {
  const text = notice !== null && notice !== record.blockedReason ? notice : null;
  if (text === null && !page.capOpen) return null;
  return (
    <div className="ar-notice">
      {text !== null && <p role="alert">{text}</p>}
      {page.capOpen && (
        <CapInput
          cap={record.budget.capUsd}
          inputId="ar-raise-cap-in"
          submitLabel="Raise cap"
          onRaise={(capUsd) => actions.raiseCap(record.id, capUsd)}
          onError={page.setNotice}
          onDone={() => page.setCapOpen(false)}
        />
      )}
    </div>
  );
}

const UNLINKED = 'dispatch state could not be confirmed after restart:';

/** The stop tile: the saved cause in the user's words, and the controls that recover it. */
function StoppedTile({ record, activity, form, headerActions }: { record: ProjectRecord; activity: ReturnType<typeof projectActivity>; form: ReactNode; headerActions: HeaderAction[] }) {
  const unlinked = record.blockedReason?.startsWith(UNLINKED);
  const reason = unlinked
    ? 'Architect lost the link to a workflow when Sero restarted. The work may have started, so Architect will not start another copy. The existing workflow must be reconnected before this project can continue.'
    : activity.reason ?? null;
  return (
    <BoardStopped
      label={activity.action === 'Review access' ? 'Not started' : activity.state === 'waiting-for-you' ? 'Needs you' : 'Stopped'}
      headline={unlinked ? 'The link to a workflow is lost' : activity.headline}
      // The owner line names the Room or Workflow, so Open Room says which one it opens.
      what={unlinked ? null : activity.owner}
      reason={reason}
      detail={unlinked ? record.blockedReason ?? undefined : undefined}
    >
      {form}
      {headerActions.map((item) => (
        <Button key={item.label} size="sm" className={`ar-btn ${item.primary ? 'ar-btn-solid' : ''}`} onClick={item.run}>{item.label}</Button>
      ))}
    </BoardStopped>
  );
}

interface BoardColumnProps {
  record: ProjectRecord;
  actions: ArchitectActions;
  page: ReturnType<typeof useProjectPageControls>;
  board: Board;
  /** The state a stop tile reports: the project's state with open questions set aside. */
  activity: ReturnType<typeof projectActivity>;
  /** The project waits on a check or on the user. Work in hand is the Live tile's to show. */
  wait: boolean;
  rows: readonly LiveRow[];
  notice: string | null;
  headerActions: HeaderAction[];
  onOpenWork(tab: WorkTab): void;
  onChangeDecision(row: MadeRow): void;
}

/** The large tiles that apply now, in their fixed order, then the decisions made. */
function BoardColumn({ record, actions, page, board, activity, wait, rows, notice, headerActions, onOpenWork, onChangeDecision }: BoardColumnProps) {
  const id = record.id;
  const preview = useProjectPreview(id);
  // Finished work is what adds a preview, so the question is asked again when a milestone changes state.
  const hasPreview = usePreviewAvailable(id, record.milestones.map((milestone) => milestone.status).join(','));
  const started = !hasAgreement(record) ? record.phase !== 'intake' : agreementApproved(record);
  const checked = record.milestones.some((milestone) => milestone.evidence);
  // The result shows the newest proof picture: the step checked last that has one.
  const proof = board.steps.reduce<BoardStep | null>((newest, step) => (step.proofKey !== null && (!newest?.proofKey || step.proofKey > newest.proofKey) ? step : newest), null);
  // The top tile already says the newest sentence. It is not said twice.
  const resultText = record.overview?.result && record.overview.result.text !== board.sentence ? record.overview.result.text : null;
  return (
    <div className="bd-col">
      <PageNotice record={record} actions={actions} notice={notice} page={page} />
      {board.main.includes('ask') && <BoardAsk record={record} actions={page.needsActions} onOpenWork={onOpenWork} />}
      {board.main.includes('stopped') && <StoppedTile record={record} activity={activity} form={recoveryForm(record, actions, page.setNotice)} headerActions={headerActions} />}
      {/* A stop or a question already says why nothing runs, and holds its own control. */}
      {started && wait && !board.main.includes('stopped') && !board.main.includes('ask') && <WaitCard record={record} actions={actions} />}
      {board.main.includes('live') && <BoardLive record={record} rows={rows} onOpenSession={page.controls.openSession} />}
      {board.main.includes('result') && (
        <BoardResult
          headline={activity.headline}
          text={resultText}
          preview={hasPreview ? { busy: preview.busy, open: () => void preview.open() } : null}
          onOpenChecks={checked ? () => onOpenWork('evidence') : null}
          picture={proof && <ProofPicture projectId={id} step={proof} className="bd-picture" />}
        />
      )}
      {preview.error && <p role="alert" className="ar-error">{preview.error}</p>}
      {preview.url && <PreviewFrame url={preview.url} />}
      {record.blockedReason && record.milestones.some((item) => item.pendingDispatch) && <RepairCard projectId={id} />}
      {board.made.length > 0 && <BoardMade rows={board.made} onChange={onChangeDecision} />}
    </div>
  );
}

export function ProjectPage({ record, actions, onBack, onOpenModels, onOpenInspector, onOpenHistory, onOpenWork, confirm, runtimeRunning, permissionPending = false, startRefusal = null }: ProjectPageProps) {
  const id = record.id;
  const page = useProjectPageControls(record, actions, onBack, confirm, onOpenModels, onOpenInspector, onOpenHistory);
  const directiveRef = useRef<HTMLTextAreaElement>(null);
  const focusDirective = useCallback(() => directiveRef.current?.focus(), []);
  // Change on a decision starts a message about it. A new seed remounts the box with that text.
  const [seed, setSeed] = useState({ count: 0, text: '' });
  const feedback = useProjectFeedback(record, actions);
  const { epoch, work } = useProjectWork(record, actions);
  const headerActions = useHeaderActions(record, runtimeRunning, focusDirective, feedback, permissionPending ? null : page.controls.resume);
  // A refused start is shown until the project starts or a later action says something newer.
  const notice = page.notice ?? (hasAgreement(record) && !agreementApproved(record) ? startRefusal : null);
  const started = !hasAgreement(record) ? record.phase !== 'intake' : agreementApproved(record);

  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning, feedback });
  const rows = liveRows(record, work, epoch, runtimeRunning);
  const wait = waitCard(record, Date.parse(record.updatedAt));
  // The state with the open questions set aside. A failed Workflow keeps its fix on screen while a question waits.
  const open = record.decisions.some((decision) => decision.answer === null);
  const beneath = open ? projectActivity({ ...record, decisions: record.decisions.filter((decision) => decision.answer !== null) }, { sessionStartedAt: sessionStartedAt(), runtimeRunning, feedback }) : activity;
  const board = boardOf(record, activity, {
    beneath,
    live: rows.length > 0,
    action: rows[0] ? rowAction(rows[0].entry) : undefined,
    waitingFor: wait?.kind === 'waiting' ? wait.rows.find((row) => row.label === 'Waiting for')?.value : undefined,
  });
  // The Plan tile exists when there are steps, a written plan or research to open.
  const hasPlan = board.steps.length > 0 || board.planNote !== null || board.researched;

  return (
    <div className="bd-canvas">
      <TopBar record={record} controls={page.controls} onBack={onBack} onNewProject={() => undefined} />
      <div className="bd-board" data-solo={hasPlan ? undefined : ''}>
        <BoardHero record={record} board={board} />
        <BoardColumn
          record={record}
          actions={actions}
          page={page}
          board={board}
          activity={beneath}
          wait={wait !== null && wait.kind !== 'working'}
          rows={rows}
          notice={notice}
          headerActions={headerActions}
          onOpenWork={onOpenWork}
          onChangeDecision={(row) => setSeed((was) => ({ count: was.count + 1, text: `Change this decision: "${row.text}". ` }))}
        />
        {hasPlan && (
          <div className="bd-side">
            <BoardPlan projectId={id} steps={board.steps} note={board.planNote} onOpenPlan={() => onOpenWork('plan')} onOpenResearch={board.researched ? () => onOpenWork('research') : null} onOpenChecks={() => onOpenWork('evidence')} />
          </div>
        )}
      </div>
      <div className="bd-tile bd-say">
        <DirectiveComposer
          key={seed.count}
          initialDraft={seed.text}
          autoFocus={seed.count > 0}
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
    </div>
  );
}
