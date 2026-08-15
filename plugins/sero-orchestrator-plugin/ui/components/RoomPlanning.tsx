/**
 * The two things the planner says while it works: that it is working, and that
 * it cannot finish without knowing more.
 *
 * Both appear in the create flow and again when a draft Room is adjusted, so
 * they live here rather than in either screen.
 */

import { useEffect, useState } from 'react';
import type { HumanQuestion } from '../../shared/human-input-types';
import { cn } from '@sero-ai/ui/lib/utils';
import { NoteBlock } from './room-kit';

/**
 * What designing a team involves (prototype screen 3). The planner is one
 * isolated call that reports nothing until it returns, so the walk through
 * these steps is presentation — an honest description of the work paced on
 * the usual planning time, replaced by the real proposal the moment the call
 * answers.
 */
const STEPS = [
  'Read the problem and your limits',
  'Check what this workspace can do',
  'Choose the roles and how they will work together',
  'Check the plan against your limits',
  'Work out the access this team needs',
];

const ESTIMATE_SECONDS = 15;
const SECONDS_PER_STEP = 3;

/**
 * The wait, in the user's own terms. Nothing is created and nothing is spent
 * here — the planner is one isolated call, not a Room.
 */
export function RoomPreparing({ title }: { title: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const current = Math.min(Math.floor(elapsed / SECONDS_PER_STEP), STEPS.length - 1);
  const pct = Math.min(94, (elapsed / ESTIMATE_SECONDS) * 100);
  const left = ESTIMATE_SECONDS - elapsed;

  return (
    <div className="mx-auto mt-[clamp(40px,14vh,120px)] w-[min(600px,100%)] px-6 text-center">
      <h3 className="text-xl font-semibold tracking-[-0.03em] text-room-text">{title}</h3>
      <p className="mt-[9px] text-[13px] leading-relaxed text-room-text3">
        Sero is choosing who this problem needs, what each of them will do, and the limits they
        will work inside. No session has been created and nothing has been spent yet.
      </p>
      <div className="mt-[34px] grid gap-0.5 text-left">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className={cn(
              'flex items-center gap-[11px] rounded-lg px-[13px] py-[11px] text-xs',
              i < current && 'text-room-text3',
              i === current && 'border border-room-line bg-room-surface text-room-text2',
              i > current && 'text-room-text4',
            )}
          >
            <span
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-full border text-[9px]',
                i < current && 'border-brand-primary-border bg-brand-primary-muted text-brand-primary',
                i === current && 'border-brand-primary text-brand-primary',
                i > current && 'border-room-line-strong text-room-text4',
              )}
            >
              {i < current ? '✓' : i === current ? '◐' : ''}
            </span>
            {step}
          </div>
        ))}
      </div>
      <div className="mt-[26px] h-0.5 overflow-hidden rounded-[2px] bg-room-muted">
        <span className="block h-full bg-brand-primary transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <p className="room-tabular mt-3.5 text-[11px] text-room-text4">
        {left > 0 ? `About ${left} seconds left` : 'Taking a little longer than usual'}
      </p>
    </div>
  );
}

/** What the planner asked, so the user can answer it rather than read a failure. */
export function RoomPlannerQuestions({ lead, questions }: { lead: string; questions: HumanQuestion[] }) {
  return (
    <div className="mx-auto mt-6 w-[min(808px,100%)] px-6">
      <NoteBlock tone="info" title="The planner needs more">
        <p className="text-xs text-room-text2">{lead}</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
          {questions.map((question) => <li key={question.id}>{question.prompt}</li>)}
        </ul>
        <p className="mt-2 text-[10px] text-room-text3">Add the answers to your description and try again.</p>
      </NoteBlock>
    </div>
  );
}
