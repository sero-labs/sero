/**
 * Opens a project's preview through the ONE action that does it.
 *
 * Shared because two controls now open the same preview — the preview card, and
 * a milestone's capture row — and two copies of the action would be free to
 * drift apart.
 */

import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import { PROJECTS_TOOL, toOutcome } from './actions';

export interface ProjectPreviewHandle {
  busy: boolean;
  /** The preview's URL once it is up. */
  url: string | null;
  error: string | null;
  open(): Promise<void>;
}

export function useProjectPreview(projectId: string): ProjectPreviewHandle {
  const { run } = useAppTools();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await run(PROJECTS_TOOL, { action: 'preview', projectId });
      const outcome = toOutcome(result);
      if (!outcome.ok || typeof result.details?.url !== 'string') setError(outcome.text);
      else setUrl(result.details.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, projectId, run]);

  return { busy, url, error, open };
}
