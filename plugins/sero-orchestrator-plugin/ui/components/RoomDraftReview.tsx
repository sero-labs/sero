/**
 * Reviewing a Room before it runs (prototype screens 4–7).
 *
 * A draft Room is a proposal and nothing else: no session exists, nothing has
 * been spent, and there is nothing to watch. It reaches this screen two ways —
 * straight out of the create flow, or opened from the list later, because a
 * chat can prepare a Room for the user to approve (FR-029) and because a
 * proposal the user walked away from is still there when they come back.
 *
 * The proposal is computed from the Room's own stored blueprint, so what is
 * approved here is what the runtime will enforce — whoever asked for the Room,
 * and however long ago.
 */

import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import { ArrowLeft } from 'lucide-react';
import type { BlueprintClamp } from '../../shared/room-clamp';
import type { HumanQuestion } from '../../shared/human-input-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { useRoom } from '../lib/use-room-index';
import { RoomProposal } from './RoomProposal';
import { RoomAdvancedSettings } from './RoomAdvancedSettings';
import { RoomPreparing, RoomPlannerQuestions } from './RoomPlanning';

/** What `rooms` answers with when it re-planned, or could not. */
interface ReviewDetails {
  ok?: boolean;
  needsInput?: boolean;
  questions?: HumanQuestion[];
  clamps?: BlueprintClamp[];
}

interface RoomDraftReviewProps {
  roomId: string;
  busy: boolean;
  /**
   * What the user's limits changed in the planning call that just ran. A Room
   * opened from the list has none: clamps report on one planning call, they are
   * not part of the Room.
   */
  clamps?: BlueprintClamp[];
  dispatch: (params: Record<string, unknown>) => Promise<ReviewDetails | null>;
  onStarted?: (roomId: string) => void;
  /** Where discarding leaves the user, and where Back goes when it is shown. */
  onLeave: () => void;
  showBack?: boolean;
}

export function RoomDraftReview({
  roomId,
  busy,
  clamps = [],
  dispatch,
  onStarted,
  onLeave,
  showBack = false,
}: RoomDraftReviewProps) {
  const [rethinking, setRethinking] = useState(false);
  // Null until an adjustment lands, so the clamps from the planning call that
  // opened this screen stay on show until there is a newer answer.
  const [revised, setRevised] = useState<BlueprintClamp[] | null>(null);
  const [questions, setQuestions] = useState<HumanQuestion[]>([]);
  const room = useRoom(roomId);

  const adjust = async (instruction: string) => {
    setRethinking(true);
    const details = await dispatch({ action: 'adjust', roomId, instruction });
    setRethinking(false);
    setQuestions(details?.needsInput ? details.questions ?? [] : []);
    // A refused adjustment leaves the Room as it was, so the proposal on screen
    // is still the right one — it is recomputed from the record either way.
    if (details?.ok) setRevised(details.clamps ?? []);
  };

  const start = async () => {
    const details = await dispatch({ action: 'start', roomId });
    if (details?.ok) onStarted?.(roomId);
  };

  const discard = async () => {
    await dispatch({ action: 'delete', roomId });
    onLeave();
  };

  if (rethinking) return <RoomPreparing title="Rethinking the team" />;

  if (!room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
        Reading this Room…
        <Button size="sm" variant="ghost" onClick={onLeave}>Back to Rooms</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {showBack && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <Button size="sm" variant="ghost" onClick={onLeave}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Rooms
          </Button>
        </div>
      )}

      {questions.length > 0 && (
        <RoomPlannerQuestions
          lead="The planner needs to know more before it can change this Room."
          questions={questions}
        />
      )}

      <RoomProposal
        proposal={computeProposalSummary(room.definition.blueprint)}
        clamps={revised ?? clamps}
        busy={busy}
        onStart={start}
        onAdjust={adjust}
        onDiscard={discard}
      />
      <RoomAdvancedSettings blueprint={room.definition.blueprint} />
    </div>
  );
}
