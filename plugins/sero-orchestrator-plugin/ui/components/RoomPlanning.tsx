/**
 * The two things the planner says while it works: that it is working, and that
 * it cannot finish without knowing more.
 *
 * Both appear in the create flow and again when a draft Room is adjusted, so
 * they live here rather than in either screen.
 */

import type { HumanQuestion } from '../../shared/human-input-types';
import { NoteBlock } from './room-kit';
import { PlannerWait } from './PlannerWait';

/**
 * The wait while the planner designs or redesigns a team. It is one isolated
 * call that reports nothing until it returns, so the screen shows a spinner and
 * the real time since the request — never a step list, a bar or a countdown
 * (prototype screen 2).
 */
export function RoomPreparing({ title }: { title: string }) {
  return <PlannerWait title={title} />;
}

/** What the planner asked, so the user can answer it rather than read a failure. */
export function RoomPlannerQuestions({ lead, questions }: { lead: string; questions: HumanQuestion[] }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-[58rem] px-6">
      <NoteBlock tone="info" title="The planner needs more">
        <p className="text-sm text-room-text2">{lead}</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
          {questions.map((question) => <li key={question.id}>{question.prompt}</li>)}
        </ul>
        <p className="mt-2 text-xs text-room-text3">Add the answers to your description and try again.</p>
      </NoteBlock>
    </div>
  );
}
