/**
 * Opens a project's preview through the ONE action that does it.
 *
 * Shared because two controls now open the same preview — the preview card, and
 * a milestone's capture row — and two copies of the action would be free to
 * drift apart.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import { PROJECTS_TOOL, toOutcome } from './actions';

export interface ProjectPreviewHandle {
  busy: boolean;
  /** The preview's URL once it is up. */
  url: string | null;
  error: string | null;
  open(): Promise<void>;
}

/**
 * Whether the project has anything to preview, so the button shows only then.
 *
 * Asked when the page opens and again when `workKey` changes, which is when
 * finished work may have added a preview. Nothing asks on a timer.
 */
export function usePreviewAvailable(projectId: string, workKey: string): boolean {
  const { run } = useAppTools();
  const [known, setKnown] = useState<{ key: string; available: boolean } | null>(null);
  const key = `${projectId}:${workKey}`;

  useEffect(() => {
    let current = true;
    void run(PROJECTS_TOOL, { action: 'preview_available', projectId })
      .then((result) => toOutcome(result).ok, () => false)
      .then((available) => { if (current) setKnown((was) => was?.key === key && was.available === available ? was : { key, available }); });
    return () => { current = false; };
  }, [key, projectId, run]);

  // The last answer stands while a new one is on its way, so the button does not flicker.
  return known?.available ?? false;
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
