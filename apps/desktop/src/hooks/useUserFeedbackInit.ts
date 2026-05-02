/**
 * Hook to initialize user-feedback IPC listeners.
 *
 * Extracted from ChatPanel to reduce its line count.
 * Call once on mount; returns cleanup function.
 */

import { useEffect } from 'react';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';

export function useUserFeedbackInit(): void {
  const initListeners = useUserFeedbackStore((s) => s.initListeners);
  useEffect(() => {
    const unsub = initListeners();
    return unsub;
  }, [initListeners]);
}
