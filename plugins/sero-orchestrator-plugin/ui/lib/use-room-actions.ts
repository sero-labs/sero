import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { useAppTools } from '@sero-ai/app-runtime';
import type { RoomApprovalDecision } from '../components/AttentionQueue';
import type { OrchestratorView } from './orchestrator-navigation';

type AppToolRun = ReturnType<typeof useAppTools>['run'];
type Navigate = (view: OrchestratorView, options?: { replace?: boolean }) => void;

export function useRoomActions({
  run,
  setBusy,
  setError,
  navigate,
}: {
  run: AppToolRun;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  navigate: Navigate;
}) {
  const dispatch = useCallback(async (params: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await run('rooms', params);
      const details = result?.details as { ok?: boolean; error?: string } | null;
      if (details?.ok === false && details.error) setError(details.error);
      return details;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, [run, setBusy, setError]);

  const onApproval = useCallback((roomId: string, approvalId: string, decision: RoomApprovalDecision) => {
    void dispatch({ action: 'resolve_approval', roomId, approvalId, decision });
  }, [dispatch]);
  const onAnswer = useCallback((roomId: string, memberId: string, body: string) => {
    void dispatch({ action: 'intervene', roomId, memberIds: memberId, body, deliver: 'now' });
  }, [dispatch]);
  const onResume = useCallback((roomId: string) => {
    void dispatch({ action: 'resume', roomId });
  }, [dispatch]);
  const open = useCallback((roomId: string) => navigate({ mode: 'rooms', roomId }), [navigate]);
  const openCreate = useCallback(() => navigate({ mode: 'room-create' }), [navigate]);

  return { dispatch, onApproval, onAnswer, onResume, open, openCreate };
}
