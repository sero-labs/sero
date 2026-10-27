import { useEffect, useState } from 'react';
import type { UserFeedbackPendingQuestion } from '@sero-ai/common';
import { getSeroApi } from './sero-bridge';

/** The host owns these requests. Subscribe before hydration so answers cannot reappear from an older read. */
export function usePendingQuestions(): readonly UserFeedbackPendingQuestion[] {
  const [pending, setPending] = useState<readonly UserFeedbackPendingQuestion[]>([]);
  useEffect(() => {
    let active = true;
    let revision = 0;
    let bridge;
    try { bridge = getSeroApi().userFeedback; } catch { return; }
    if (!bridge) return;
    const remove = (id: string) => {
      revision += 1;
      setPending((current) => current.filter((item) => item.id !== id));
    };
    const offQuestion = bridge.onQuestion((question) => {
      revision += 1;
      setPending((current) => [...current.filter((item) => item.id !== question.id), question]);
    });
    const offCancel = bridge.onCancel(({ id }) => remove(id));
    const answered = (event: Event) => remove((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener('sero:user-feedback:answered', answered);
    const api = bridge;
    const hydrate = async (): Promise<void> => {
      const before = revision;
      const snapshot = await api.getPending();
      if (!active) return;
      if (before !== revision) return hydrate();
      setPending(snapshot);
    };
    void hydrate().catch(() => undefined);
    return () => {
      active = false;
      offQuestion();
      offCancel();
      window.removeEventListener('sero:user-feedback:answered', answered);
    };
  }, []);
  return pending;
}
