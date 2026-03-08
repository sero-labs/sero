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
import { useAppState } from '@sero/app-runtime';
import { ClipboardList, MessageCircleQuestion, Mic, Loader2, Sparkles } from 'lucide-react';
import { QuestionnaireForm } from './QuestionnaireForm';
import { InterviewForm } from './InterviewForm';
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

  // Hydrate on mount: fetch any pending questionnaire/interview that arrived
  // before this component was mounted (e.g. user was on a different app tab).
  useEffect(() => {
    window.sero.userFeedback.getPending().then((items) => {
      const match = items.find(
        (q) => q.type === 'questionnaire' || q.type === 'interview',
      );
      if (match) setPending(match);
    });
  }, []);

  // Listen for live questionnaire/interview events from main process
  useEffect(() => {
    const unsubQuestion = window.sero.userFeedback.onQuestion((data) => {
      // Handle questionnaires + interviews — single questions go to ChatPanel
      if (data.type === 'questionnaire' || data.type === 'interview') {
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
      // Clear onboarding flag when questionnaire completes
      sessionStorage.removeItem('sero:onboarding');
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
  const isOnboarding = sessionStorage.getItem('sero:onboarding') === 'memory-setup';

  if (isOnboarding) {
    return <OnboardingWaitState />;
  }

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

function OnboardingWaitState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background p-8">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="size-8 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Setting up your profile
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          The agent is preparing a few questions to get to know you.
          This will only take a moment.
        </p>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Preparing questionnaire…</span>
      </div>
    </div>
  );
}

export default UserFeedbackApp;
