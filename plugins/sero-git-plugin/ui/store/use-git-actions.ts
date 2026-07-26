/**
 * Running a git action, and saying so when it refuses.
 *
 * The two belong together: a failed action is the only thing that raises a
 * notice, and the notice is the only place a failure is reported. Splitting
 * them would leave each half with nothing to do on its own.
 */

import { useCallback, useRef, useState } from 'react';

import type { GitActionResult, GitManagerRequest } from '../../shared/types';
import { getActionFailureTitle } from '../lib/action-copy';
import { runGitAction } from './sero-bridge';

export interface GitActionNoticeState {
  id: number;
  title: string;
  message: string;
}

/** How long a notice stays on screen before it clears itself. */
const NOTICE_MS = 5000;

export interface GitActions {
  notice: GitActionNoticeState | null;
  dismissNotice: () => void;
  /** Fire and forget — for the handlers wired straight to a control. */
  runAction: (params: GitManagerRequest) => void;
  /**
   * Resolves false when the action failed, so callers that must sequence —
   * stash *then* switch — can stop rather than carry on into a broken state.
   */
  runActionAsync: (params: GitManagerRequest) => Promise<boolean>;
}

export function useGitActions(workspaceId: string): GitActions {
  const [notice, setNotice] = useState<GitActionNoticeState | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissNotice = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(null);
  }, []);

  const showNotice = useCallback((title: string, message: string) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }

    const nextNotice: GitActionNoticeState = {
      id: Date.now(),
      title,
      message,
    };
    setNotice(nextNotice);
    noticeTimerRef.current = setTimeout(() => {
      setNotice((current) => current?.id === nextNotice.id ? null : current);
      noticeTimerRef.current = null;
    }, NOTICE_MS);
  }, []);

  const runActionAsync = useCallback(async (params: GitManagerRequest): Promise<boolean> => {
    try {
      const actionResult: GitActionResult = await runGitAction(workspaceId, params);
      if (!actionResult.ok) {
        console.error('[git-app] Action failed:', actionResult.message);
        showNotice(getActionFailureTitle(params.action), actionResult.message);
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[git-app] Action failed:', error);
      showNotice(getActionFailureTitle(params.action), message);
      return false;
    }
  }, [showNotice, workspaceId]);

  const runAction = useCallback((params: GitManagerRequest) => {
    void runActionAsync(params);
  }, [runActionAsync]);

  return { notice, dismissNotice, runAction, runActionAsync };
}
