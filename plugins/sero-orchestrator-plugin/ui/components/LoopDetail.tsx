import { memo } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import type {
  GithubSourceHealth,
  LibraryIndex,
  Loop,
  LoopSummary,
  OrchestratorAction,
  RunIndex,
  WebhookSourceHealth,
} from '../../shared/types';
import { DEFAULT_RUN_INDEX } from '../../shared/defaults';
import { WORKFLOWS_LABEL } from '../../shared/labels';
import { useWatchedJson } from '../lib/use-watched-json';
import { useLibraryLink } from '../lib/use-library-link';
import { NeedsYouBadge } from './StatusBadge';
import { LoopControls } from './LoopControls';
import { LoopSettingsLine } from './LoopSettingsLine';
import { LoopResult } from './LoopResult';
import { LoopStateLine } from './LoopStateLine';
import { LibrarySaveControl } from './LibrarySaveControl';
import { SkillDraftControl } from './SkillDraftControl';
import { LibraryLinkBadge } from './LibraryLinkBadge';
import { LibraryLinkSection } from './LibraryLinkSection';
import { LiveActivityStrip } from './LiveActivityStrip';
import { CollapsibleSection } from './CollapsibleSection';
import { PlanPresentation } from './PlanPresentation';
import { RefinePlan } from './RefinePlan';
import { AttemptHistory } from './AttemptHistory';
import { SuggestionsInbox } from './SuggestionsInbox';
import { InputRequestCard } from './InputRequestCard';

const REFINABLE: ReadonlySet<Loop['status']> = new Set(['draft', 'active', 'disabled', 'blocked']);
const MemoizedPlanPresentation = memo(PlanPresentation);

interface LoopDetailProps {
  loop: Loop;
  /** The watched index entry, for the state line's activity word. */
  summary: LoopSummary | null;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  /** Tool dispatch that returns the action's result — the skill draft review needs it. */
  onDispatch: (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  /** State directory, used to watch this loop's runs/index.json for run history. */
  stateDir: string;
  /** Profile-global library dir, for a linked loop's status + update controls. */
  libraryDir: string | null;
  /** The watched library index, for a linked loop's version status. */
  libraryIndex: LibraryIndex;
  /** Back to the Workflows list. */
  onBack: () => void;
}

/**
 * One Workflow, as the approved drawing sets it
 * (prototypes/agent-workspace-ux-audit/2-act-on-it.html, frame 4).
 *
 * The top row names the Workflow and holds every control once: Library,
 * Reflect and Skill quiet, then More actions, then the one primary action.
 * Below it, the state line and the settings, then whatever needs you, then the
 * plan, then the folds.
 *
 * The page used to repeat itself: a title with a status badge over a state line
 * that said the same, the prompt restated above the objective, a "Plan" fold
 * around the plan, and a completion card saying "complete" under a state line
 * that already did.
 */
export function LoopDetail({ loop, summary, busy, onAction, onDispatch, stateDir, libraryDir, libraryIndex, onBack }: LoopDetailProps) {
  const runIndex = useWatchedJson<RunIndex>(`${stateDir}/loops/${loop.id}/runs/index.json`, DEFAULT_RUN_INDEX);
  // Source health for the state line: the event adapters persist these small
  // state files; the line shows them only when the loop uses the source.
  const githubHealth = useWatchedJson<GithubSourceHealth | null>(`${stateDir}/events/github.json`, null);
  const webhookHealth = useWatchedJson<WebhookSourceHealth | null>(`${stateDir}/events/webhook.json`, null);
  const linkStatus = useLibraryLink(loop, libraryDir, libraryIndex);
  const insights = loop.insights ?? [];
  const runs = runIndex.runs.length;
  // A skill is extracted from what worked, so the control appears only once a run
  // has actually completed (or while a draft from one is still under review).
  const canExtractSkill = loop.skillDraft?.status === 'pending'
    || runIndex.runs.some((run) => run.completionStatus === 'complete');

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <LoopTopRow
        loop={loop}
        busy={busy}
        onAction={onAction}
        onDispatch={onDispatch}
        onBack={onBack}
        linkStatus={linkStatus}
        canReflect={runs > 0}
        canExtractSkill={canExtractSkill}
      />

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <header className="flex flex-col gap-3">
          <LoopStateLine loop={loop} summary={summary} runCount={runs} githubHealth={githubHealth} webhookHealth={webhookHealth} />
          {/* The result of the ending, for every ending, above the settings.
              The request that started the Workflow opens from the objective's
              own disclosure, which the plan carries — so the paragraph that
              showed it only when there was no objective is gone. */}
          <LoopResult loop={loop} />
          <LoopSettingsLine loop={loop} runs={runIndex.runs} busy={busy} onAction={onAction} />
        </header>

        <LiveActivityStrip loop={loop} runIndex={runIndex} />

        <InputRequestCard loop={loop} busy={busy} onAction={onAction} />
        <SuggestionsInbox loop={loop} busy={busy} onAction={onAction} />

        <LoopNotices loop={loop} />

        {linkStatus?.hasActions && (
          <CollapsibleSection title="Library" defaultOpen>
            <LibraryLinkSection loop={loop} status={linkStatus} busy={busy} onAction={onAction} />
          </CollapsibleSection>
        )}

        <section className="flex flex-col gap-3">
          <MemoizedPlanPresentation
            key={`${loop.id}:${loop.status === 'draft' ? 'draft' : 'live'}`}
            loop={loop}
            onAction={onAction}
          />
          {REFINABLE.has(loop.status) && (
            <RefinePlan key={loop.id} busy={busy} planRevision={loop.plan.revision} onRefine={(prompt) => onAction({ kind: 'revise', loopId: loop.id, prompt })} />
          )}
        </section>

        <div className="flex flex-col">
          <CollapsibleSection title="Attempt history" hint={`${runs} run${runs === 1 ? '' : 's'}`}>
            <AttemptHistory runs={runIndex.runs} />
          </CollapsibleSection>
          {insights.length > 0 && (
            <CollapsibleSection title="What reflection has learned">
              <ul className="ml-4 list-disc text-xs text-room-text2">
                {insights.map((insight) => <li key={insight.id}>{insight.summary}</li>)}
              </ul>
            </CollapsibleSection>
          )}
        </div>
      </div>
    </div>
  );
}

/** The back link, the title and every control, once. */
function LoopTopRow({ loop, busy, onAction, onDispatch, onBack, linkStatus, canReflect, canExtractSkill }: Pick<LoopDetailProps, 'loop' | 'busy' | 'onAction' | 'onDispatch' | 'onBack'> & {
  linkStatus: ReturnType<typeof useLibraryLink>;
  canReflect: boolean;
  canExtractSkill: boolean;
}) {
  const pendingInput = loop.runtime.pendingInput?.questions.length ?? 0;
  const pendingSuggestions = (loop.suggestions ?? []).filter((s) => s.status === 'pending').length;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-room-line px-4 py-2">
      <button
        type="button"
        className="group cursor-pointer text-xs text-room-text3 transition-colors hover:text-room-text"
        onClick={onBack}
      >
        ←{' '}
        <span className="underline decoration-room-text4 decoration-dotted underline-offset-[3px] group-hover:decoration-solid group-hover:decoration-current">
          {WORKFLOWS_LABEL}
        </span>
      </button>
      <span className="text-xs text-room-text3">·</span>
      <h1 className="min-w-0 truncate text-xs font-medium text-room-text2">{loop.title}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <NeedsYouBadge kind="input" count={pendingInput} />
        <NeedsYouBadge kind="suggestions" count={pendingSuggestions} />
        {linkStatus && <LibraryLinkBadge loop={loop} status={linkStatus} busy={busy} onAction={onAction} />}
        <LibrarySaveControl loop={loop} busy={busy} onAction={onAction} />
        {canReflect && (
          <Button
            size="sm"
            variant="ghost"
            className="text-room-text3"
            disabled={busy}
            onClick={() => onAction({ kind: 'reflect', loopId: loop.id })}
            title="Learn from past runs and suggest improvements"
          >
            Reflect
          </Button>
        )}
        {canExtractSkill && <SkillDraftControl loop={loop} busy={busy} onDispatch={onDispatch} />}
        <LoopControls loop={loop} busy={busy} onAction={onAction} />
      </div>
    </div>
  );
}

/**
 * Whatever explains a Workflow that is not simply running: a snooze, its
 * warnings, a block, and an ending that was not complete.
 */
function LoopNotices({ loop }: { loop: Loop }) {
  const { runtime } = loop;
  return (
    <>
      {runtime.snoozedUntil && (
        <Card className="border-blue-500/30 bg-blue-500/[0.05] p-3 text-base">
          Snoozed until {new Date(runtime.snoozedUntil).toLocaleString()}. The workspace will be checked again before the Workflow runs.
        </Card>
      )}

      {loop.warnings.length > 0 && (
        <Card className="flex flex-col gap-1 border-amber-500/40 p-3 text-base">
          {loop.warnings.map((w) => (
            <div key={w.id} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
              <span>{w.message}</span>
            </div>
          ))}
        </Card>
      )}

      <BlockNotice loop={loop} />
    </>
  );
}

/**
 * A step-owned block (planned/recovery) points at the step, where the reason and
 * a Retry button live. A block with no step of its own is a limit or a runtime
 * fault, and the Workflow's own reason — printed by the Result row above — is
 * the whole statement; a second card here said the same thing twice.
 */
function BlockNotice({ loop }: { loop: Loop }) {
  const block = loop.runtime.block;
  if (!block?.sourceStepId) return null;
  const blockedStep = loop.plan.steps.find((step) => step.id === block.sourceStepId);
  if (!blockedStep) return null;
  return (
    <Card className="border-destructive/50 p-3 text-base">
      <span>
        <span className="font-medium text-destructive">Blocked at “{blockedStep.title}”. </span>
        Fix the cause, then <span className="font-medium">Retry step</span> on it in the plan below — or <span className="font-medium">Restart</span> the Workflow.
      </span>
    </Card>
  );
}
