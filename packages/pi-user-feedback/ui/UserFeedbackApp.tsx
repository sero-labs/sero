/**
 * UserFeedbackApp — dedicated Sero app UI for questionnaire interactions.
 *
 * - When a questionnaire is pending: shows the multi-step form
 * - When idle: shows a status message
 *
 * Single questions are handled in the ChatPanel (PendingQuestionCard),
 * not here. This app only activates for multi-question questionnaires.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppState } from '@sero/app-runtime';
import { ClipboardList, MessageCircleQuestion } from 'lucide-react';
import { QuestionnaireForm } from './QuestionnaireForm';
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

  // Pending questionnaire — received via IPC from main process
  const [pending, setPending] = useState<UserFeedbackPendingQuestion | null>(null);

  // Hydrate on mount: fetch any pending questionnaire that arrived before this
  // component was mounted (e.g. user was on a different app tab).
  useEffect(() => {
    window.sero.userFeedback.getPending().then((items) => {
      const questionnaire = items.find((q) => q.type === 'questionnaire');
      if (questionnaire) setPending(questionnaire);
    });
  }, []);

  // Listen for live questionnaire events from main process
  useEffect(() => {
    const unsubQuestion = window.sero.userFeedback.onQuestion((data) => {
      // Only handle questionnaires — single questions go to ChatPanel
      if (data.type === 'questionnaire') {
        setPending(data);
      }
    });

    const unsubCancel = window.sero.userFeedback.onCancel((data) => {
      setPending((prev) => (prev?.id === data.id ? null : prev));
    });

    // DOM event from preload's answer() — clears regardless of who answered
    const onAnswered = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setPending((prev) => (prev?.id === id ? null : prev));
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
      setPending(null);
      updateState((prev) => ({ ...prev, lastActivity: new Date().toISOString() }));
    },
    [updateState],
  );

  const handleCancel = useCallback(
    async (id: string) => {
      const response: UserFeedbackResponse = { id, answers: [], cancelled: true };
      await window.sero.userFeedback.answer(response);
      setPending(null);
    },
    [],
  );

  if (pending) {
    return (
      <QuestionnaireForm
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
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">User Feedback</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          When the agent needs your input on multiple questions, a questionnaire
          form will appear here. Single questions appear directly in the chat panel.
        </p>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Available tools:</p>
        <ul className="mt-2 space-y-1">
          <li>• <strong>question</strong> — single question with options (ChatPanel)</li>
          <li>• <strong>questionnaire</strong> — multi-question form (this view)</li>
        </ul>
      </div>
    </div>
  );
}

export default UserFeedbackApp;
