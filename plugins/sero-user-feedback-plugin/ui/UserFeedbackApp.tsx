/**
 * UserFeedbackApp — dedicated Sero app UI for questionnaire & interview interactions.
 *
 * - Questionnaire pending: shows the multi-step options form
 * - Interview pending: shows the open-ended text-area form
 * - Idle: shows a status/help screen
 *
 * Single questions are handled in the ChatPanel (PendingQuestionCard),
 * not here. This app activates for questionnaires and interviews.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { ClipboardList, MessageCircleQuestion, Mic } from 'lucide-react';
import { QuestionnaireForm } from './QuestionnaireForm';
import { InterviewForm } from './InterviewForm';
import {
  getMultiStepPendingQuestions,
  removePendingQuestion,
  upsertPendingQuestion,
} from './pending-questions';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackAnswer,
  UserFeedbackResponse,
} from './types';
import type { UserFeedbackState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import './styles.css';

export function UserFeedbackApp() {
  // Minimal file state (just for app discovery / lastActivity tracking)
  const [_state, updateState] = useAppState<UserFeedbackState>(DEFAULT_STATE);

  // Pending questionnaire/interview queue — received via IPC from main process.
  // Keep insertion order so older prompts remain visible until resolved.
  const [pendingQuestions, setPendingQuestions] = useState<UserFeedbackPendingQuestion[]>([]);

  // Hydrate on mount: fetch any pending questionnaire/interview that arrived
  // before this component was mounted (e.g. user was on a different app tab).
  useEffect(() => {
    let cancelled = false;

    window.sero.userFeedback.getPending()
      .then((items) => {
        if (cancelled) return;
        setPendingQuestions(getMultiStepPendingQuestions(items));
      })
      .catch(() => {
        if (cancelled) return;
        setPendingQuestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for live questionnaire/interview events from main process.
  // New prompts are queued behind the current one instead of replacing it.
  useEffect(() => {
    const unsubQuestion = window.sero.userFeedback.onQuestion((data) => {
      setPendingQuestions((prev) => upsertPendingQuestion(prev, data));
    });

    const unsubCancel = window.sero.userFeedback.onCancel((data) => {
      setPendingQuestions((prev) => removePendingQuestion(prev, data.id));
    });

    // DOM event from preload's answer() — clears regardless of who answered
    const onAnswered = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setPendingQuestions((prev) => removePendingQuestion(prev, id));
    };
    window.addEventListener('sero:user-feedback:answered', onAnswered);

    return () => {
      unsubQuestion();
      unsubCancel();
      window.removeEventListener('sero:user-feedback:answered', onAnswered);
    };
  }, []);

  const handleSubmit = useCallback(
    async (id: string, answers: UserFeedbackAnswer[]) => {
      const response: UserFeedbackResponse = { id, answers, cancelled: false };
      await window.sero.userFeedback.answer(response);
      setPendingQuestions((prev) => removePendingQuestion(prev, id));
      updateState((prev) => ({ ...prev, lastActivity: new Date().toISOString() }));
    },
    [updateState],
  );

  const handleCancel = useCallback(async (id: string) => {
    const response: UserFeedbackResponse = { id, answers: [], cancelled: true };
    await window.sero.userFeedback.answer(response);
    setPendingQuestions((prev) => removePendingQuestion(prev, id));
  }, []);

  const pending = pendingQuestions[0] ?? null;

  if (pending) {
    const FormComponent =
      pending.type === 'interview' ? InterviewForm : QuestionnaireForm;
    return (
      <FormComponent
        question={pending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );
  }

  return <IdleState />;
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8">
      <div className="flex items-center gap-3 text-muted-foreground">
        <ClipboardList className="size-8" />
        <MessageCircleQuestion className="size-8" />
        <Mic className="size-8" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">User Feedback</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          When the agent needs your input, a form will appear here.
          Single questions appear directly in the chat panel.
        </p>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Available tools:</p>
        <ul className="mt-2 space-y-1">
          <li>• <strong>question</strong> — single question with options (ChatPanel)</li>
          <li>• <strong>questionnaire</strong> — multi-question form (this view)</li>
          <li>• <strong>interview</strong> — open-ended deep-dive questions (this view)</li>
        </ul>
        <p className="mt-3 font-medium text-foreground">Command:</p>
        <ul className="mt-1 space-y-1">
          <li>• <code className="rounded bg-secondary px-1">/interview &lt;path&gt;</code> — start an interview and write a spec</li>
        </ul>
      </div>
    </div>
  );
}

export default UserFeedbackApp;
