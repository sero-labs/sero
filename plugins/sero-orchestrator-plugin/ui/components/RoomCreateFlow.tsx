/**
 * Creating a Room, end to end (prototype screens 2–7).
 *
 * Three states and no more: the brief, the wait while the planner works, and
 * the proposal. The planner runs as an isolated call rather than as a Room
 * member, so nothing is created and nothing is spent until the user presses
 * Start room.
 *
 * The draft Room IS the working copy. Planning writes it, adjusting rewrites
 * it, and discarding deletes it — so a reload during the flow finds the same
 * proposal rather than an empty form.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import type { BlueprintClamp } from '../../shared/room-clamp';
import type { HumanQuestion } from '../../shared/human-input-types';
import { RoomBriefForm, type RoomBrief } from './RoomBriefForm';
import { RoomProposal } from './RoomProposal';
import { RoomAdvancedSettings } from './RoomAdvancedSettings';
import { useRoom } from '../lib/use-room-index';

/** What `rooms` answers with when it planned, or could not. */
interface PrepareDetails {
  ok?: boolean;
  error?: string;
  needsInput?: boolean;
  questions?: HumanQuestion[];
  roomId?: string;
  proposal?: RoomProposalSummary;
  clamps?: BlueprintClamp[];
}

type Stage =
  | { name: 'brief' }
  | { name: 'planning' }
  | { name: 'proposal'; roomId: string; proposal: RoomProposalSummary; clamps: BlueprintClamp[] };

interface RoomCreateFlowProps {
  busy: boolean;
  dispatch: (params: Record<string, unknown>) => Promise<PrepareDetails | null>;
  onStarted: (roomId: string) => void;
  onCancel: () => void;
}

export function RoomCreateFlow({ busy, dispatch, onStarted, onCancel }: RoomCreateFlowProps) {
  const [stage, setStage] = useState<Stage>({ name: 'brief' });
  const [questions, setQuestions] = useState<HumanQuestion[]>([]);
  const roomId = stage.name === 'proposal' ? stage.roomId : null;
  const draft = useRoom(roomId);

  /** One landing point for both planning calls, so a re-plan cannot leave a stale proposal on screen. */
  const land = (details: PrepareDetails | null, fallback: Stage) => {
    if (details?.ok && details.roomId && details.proposal) {
      setQuestions([]);
      setStage({ name: 'proposal', roomId: details.roomId, proposal: details.proposal, clamps: details.clamps ?? [] });
      return;
    }
    // The planner needs more before it can staff the Room. The brief comes back
    // with what it asked, rather than a failure the user cannot act on.
    setQuestions(details?.needsInput ? details.questions ?? [] : []);
    setStage(fallback);
  };

  const design = async (brief: RoomBrief) => {
    setStage({ name: 'planning' });
    land(
      await dispatch({
        action: 'prepare',
        problem: brief.problem,
        presetId: brief.presetId,
        maxCostUsd: brief.maxCostUsd,
        maxMinutes: brief.maxMinutes,
        access: brief.access,
        deliveryDestination: brief.deliveryDestination,
      }),
      { name: 'brief' },
    );
  };

  const adjust = async (instruction: string) => {
    if (stage.name !== 'proposal') return;
    const previous = stage;
    setStage({ name: 'planning' });
    land(await dispatch({ action: 'adjust', roomId: previous.roomId, instruction }), previous);
  };

  const start = async () => {
    if (stage.name !== 'proposal') return;
    const details = await dispatch({ action: 'start', roomId: stage.roomId });
    if (details?.ok) onStarted(stage.roomId);
  };

  const discard = async () => {
    if (stage.name === 'proposal') await dispatch({ action: 'delete', roomId: stage.roomId });
    onCancel();
  };

  if (stage.name === 'planning') return <Preparing />;

  if (stage.name === 'proposal') {
    return (
      <div className="flex-1 overflow-auto">
        <RoomProposal
          proposal={stage.proposal}
          clamps={stage.clamps}
          busy={busy}
          onStart={start}
          onAdjust={adjust}
          onDiscard={discard}
        />
        {draft && <RoomAdvancedSettings blueprint={draft.definition.blueprint} />}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {questions.length > 0 && (
        <div className="mx-auto mt-6 w-full max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-300">
            The planner needs to know more before it can staff this Room.
          </p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-amber-200/90">
            {questions.map((question) => <li key={question.id}>{question.prompt}</li>)}
          </ul>
          <p className="mt-2 text-xs text-amber-200/70">Add the answers to your description and try again.</p>
        </div>
      )}
      <RoomBriefForm busy={busy} onDesign={design} onCancel={onCancel} />
    </div>
  );
}

/**
 * The wait, in the user's own terms. Nothing is created and nothing is spent
 * here — the planner is one isolated call, not a Room.
 */
function Preparing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <div>
        <p className="text-base font-medium">Designing the team</p>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Sero is working out who this problem needs and what each of them may do. No session has been
          created and nothing has been spent yet.
        </p>
      </div>
    </div>
  );
}
