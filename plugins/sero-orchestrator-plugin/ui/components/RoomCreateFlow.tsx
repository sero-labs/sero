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
 * proposal rather than an empty form. That is also why the proposal itself is
 * `RoomDraftReview`: a Room prepared here and a Room prepared by a chat are the
 * same draft, and are approved on the same screen.
 */

import { useState } from 'react';
import type { BlueprintClamp } from '../../shared/room-clamp';
import type { HumanQuestion } from '../../shared/human-input-types';
import { RoomBriefForm, type RoomBrief } from './RoomBriefForm';
import { RoomDraftReview } from './RoomDraftReview';
import { RoomPreparing, RoomPlannerQuestions } from './RoomPlanning';

/** What `rooms` answers with when it planned, or could not. */
interface PrepareDetails {
  ok?: boolean;
  error?: string;
  needsInput?: boolean;
  questions?: HumanQuestion[];
  roomId?: string;
  clamps?: BlueprintClamp[];
}

type Stage =
  | { name: 'brief' }
  | { name: 'planning' }
  | { name: 'proposal'; roomId: string; clamps: BlueprintClamp[] };

interface RoomCreateFlowProps {
  busy: boolean;
  dispatch: (params: Record<string, unknown>) => Promise<PrepareDetails | null>;
  onStarted: (roomId: string) => void;
  onCancel: () => void;
}

export function RoomCreateFlow({ busy, dispatch, onStarted, onCancel }: RoomCreateFlowProps) {
  const [stage, setStage] = useState<Stage>({ name: 'brief' });
  const [questions, setQuestions] = useState<HumanQuestion[]>([]);

  const design = async (brief: RoomBrief) => {
    setStage({ name: 'planning' });
    const details = await dispatch({
      action: 'prepare',
      problem: brief.problem,
      presetId: brief.presetId,
      maxCostUsd: brief.maxCostUsd,
      maxMinutes: brief.maxMinutes,
      access: brief.access,
      deliveryDestination: brief.deliveryDestination,
    });
    if (details?.ok && details.roomId) {
      setQuestions([]);
      setStage({ name: 'proposal', roomId: details.roomId, clamps: details.clamps ?? [] });
      return;
    }
    // The planner needs more before it can staff the Room. The brief comes back
    // with what it asked, rather than a failure the user cannot act on.
    setQuestions(details?.needsInput ? details.questions ?? [] : []);
    setStage({ name: 'brief' });
  };

  if (stage.name === 'planning') return <RoomPreparing title="Designing the team" />;

  if (stage.name === 'proposal') {
    return (
      <RoomDraftReview
        roomId={stage.roomId}
        busy={busy}
        clamps={stage.clamps}
        dispatch={dispatch}
        onStarted={onStarted}
        onLeave={onCancel}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {questions.length > 0 && (
        <RoomPlannerQuestions
          lead="The planner needs to know more before it can staff this Room."
          questions={questions}
        />
      )}
      <RoomBriefForm busy={busy} onDesign={design} onCancel={onCancel} />
    </div>
  );
}
