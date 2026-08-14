/**
 * The two things the planner says while it works: that it is working, and that
 * it cannot finish without knowing more.
 *
 * Both appear in the create flow and again when a draft Room is adjusted, so
 * they live here rather than in either screen.
 */

import { Loader2 } from 'lucide-react';
import type { HumanQuestion } from '../../shared/human-input-types';

/**
 * The wait, in the user's own terms. Nothing is created and nothing is spent
 * here — the planner is one isolated call, not a Room.
 */
export function RoomPreparing({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" />
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Sero is working out who this problem needs and what each of them may do. No session has been
          created and nothing has been spent yet.
        </p>
      </div>
    </div>
  );
}

/** What the planner asked, so the user can answer it rather than read a failure. */
export function RoomPlannerQuestions({ lead, questions }: { lead: string; questions: HumanQuestion[] }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="text-sm font-medium text-amber-300">{lead}</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-amber-200/90">
        {questions.map((question) => <li key={question.id}>{question.prompt}</li>)}
      </ul>
      <p className="mt-2 text-xs text-amber-200/70">Add the answers to your description and try again.</p>
    </div>
  );
}
