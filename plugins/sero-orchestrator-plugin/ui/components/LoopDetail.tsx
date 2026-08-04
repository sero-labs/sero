import { memo } from 'react';
import { Card } from '@sero-ai/ui';
import { AlertTriangle } from 'lucide-react';
import type {
  GithubSourceHealth,
  LibraryIndex,
  Loop,
  OrchestratorAction,
  RunIndex,
  WebhookSourceHealth,
} from '../../shared/types';
import { DEFAULT_RUN_INDEX } from '../../shared/defaults';
import { useWatchedJson } from '../lib/use-watched-json';
import { useLibraryLink } from '../lib/use-library-link';
import { LoopStatusBadge, NeedsYouBadge } from './StatusBadge';
import { LoopControls } from './LoopControls';
import { LoopContextControl } from './LoopContextControl';
import { LoopDeliveryControl } from './LoopDeliveryControl';
import { LoopMetaStrip } from './LoopMetaStrip';
import { LibrarySaveControl } from './LibrarySaveControl';
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
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  /** State directory, used to watch this loop's runs/index.json for run history. */
  stateDir: string;
  /** Profile-global library dir, for a linked loop's status + update controls. */
  libraryDir: string | null;
  /** The watched library index, for a linked loop's version status. */
  libraryIndex: LibraryIndex;
}

/**
 * Calm single-column loop detail (specs/09-ui-redesign.md, B1 + B3 touch). The
 * input request gets top weight (the moment that needs you); a live-activity
 * strip shows while running; plan and history collapse for progressive
 * disclosure. The Library link + save controls are folded in.
 */
export function LoopDetail({ loop, busy, onAction, stateDir, libraryDir, libraryIndex }: LoopDetailProps) {
  const { runtime } = loop;
  const runIndex = useWatchedJson<RunIndex>(`${stateDir}/loops/${loop.id}/runs/index.json`, DEFAULT_RUN_INDEX);
  // Source health for the meta strip: the event adapters persist these small
  // state files; the strip shows them only when the loop uses the source.
  const githubHealth = useWatchedJson<GithubSourceHealth | null>(`${stateDir}/events/github.json`, null);
  const webhookHealth = useWatchedJson<WebhookSourceHealth | null>(`${stateDir}/events/webhook.json`, null);
  const linkStatus = useLibraryLink(loop, libraryDir, libraryIndex);
  const pendingInput = runtime.pendingInput?.questions.length ?? 0;
  const pendingSuggestions = (loop.suggestions ?? []).filter((s) => s.status === 'pending').length;

  return (
    <div className="flex h-full flex-1 flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{loop.title}</h1>
          <div className="flex items-center gap-2">
            <NeedsYouBadge kind="input" count={pendingInput} />
            <NeedsYouBadge kind="suggestions" count={pendingSuggestions} />
            {linkStatus && <LibraryLinkBadge loop={loop} status={linkStatus} busy={busy} onAction={onAction} />}
            <LoopStatusBadge status={loop.status} />
          </div>
        </div>
        <p className="text-base text-muted-foreground">{loop.summary || loop.prompt}</p>
        <LoopMetaStrip loop={loop} runs={runIndex.runs} githubHealth={githubHealth} webhookHealth={webhookHealth} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <LoopControls loop={loop} busy={busy} canReflect={runIndex.runs.length > 0} onAction={onAction} />
          <LoopContextControl loop={loop} onAction={onAction} />
          <LoopDeliveryControl loop={loop} busy={busy} onAction={onAction} />
          <LibrarySaveControl loop={loop} busy={busy} onAction={onAction} />
        </div>
      </header>

      <LiveActivityStrip loop={loop} runIndex={runIndex} />

      {runtime.snoozedUntil && (
        <Card className="border-blue-500/30 bg-blue-500/[0.05] p-3 text-base">
          Snoozed until {new Date(runtime.snoozedUntil).toLocaleString()}. The workspace will be checked again before the loop runs.
        </Card>
      )}

      <InputRequestCard loop={loop} busy={busy} onAction={onAction} />
      <SuggestionsInbox loop={loop} busy={busy} onAction={onAction} />

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

      {runtime.completion && (
        <Card className="border-emerald-500/40 p-3 text-base">
          <span className="font-medium">Completion ({runtime.completion.status}): </span>
          {runtime.completion.reason}
        </Card>
      )}

      {linkStatus?.hasActions && (
        <CollapsibleSection title="Library" defaultOpen>
          <LibraryLinkSection loop={loop} status={linkStatus} busy={busy} onAction={onAction} />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Plan" hint={`${loop.plan.steps.length} step(s)`} defaultOpen>
        <MemoizedPlanPresentation
          key={`${loop.id}:${loop.status === 'draft' ? 'draft' : 'live'}`}
          loop={loop}
          onAction={onAction}
        />
        {REFINABLE.has(loop.status) && (
          <RefinePlan key={loop.id} busy={busy} onRefine={(prompt) => onAction({ kind: 'revise', loopId: loop.id, prompt })} />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Attempt history" hint={`${runIndex.runs.length} run(s)`}>
        <AttemptHistory runs={runIndex.runs} />
      </CollapsibleSection>
    </div>
  );
}

/**
 * A step-owned block (planned/recovery) points at the step, where the reason and
 * a Retry button live. Loop-wide blocks (limit/validation/runtime) show the
 * reason here with the whole-loop recovery options.
 */
function BlockNotice({ loop }: { loop: Loop }) {
  const block = loop.runtime.block;
  if (!block) return null;
  const blockedStep = block.sourceStepId ? loop.plan.steps.find((s) => s.id === block.sourceStepId) : undefined;
  return (
    <Card className="border-destructive/50 p-3 text-base">
      {blockedStep ? (
        <span>
          <span className="font-medium text-destructive">Blocked at “{blockedStep.title}”. </span>
          Fix the cause, then <span className="font-medium">Retry step</span> on it in the plan below — or <span className="font-medium">Restart</span> the loop.
        </span>
      ) : (
        <span>
          <span className="font-medium text-destructive">Blocked ({block.kind}): </span>
          {block.reason} — <span className="font-medium">Restart</span> the loop or <span className="font-medium">Refine</span> the plan.
        </span>
      )}
    </Card>
  );
}
