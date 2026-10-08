/**
 * A picture the runtime reads for the board: a step's proof, or the last
 * screenshot the Architect took in its browser.
 */

import { useEffect, useRef, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

import { PROJECTS_TOOL } from './actions';

export interface ProjectPicture {
  dataUrl: string;
  /** When the picture was saved. */
  at: string;
}

/**
 * Asked when it is first shown and again when `key` changes, which is when a
 * new picture may have been saved. Nothing asks on a timer. `milestoneId` names
 * a step's proof; without it the browser's last screenshot is read.
 */
export function useProjectPicture(projectId: string, milestoneId: string | undefined, key: string, active = true): ProjectPicture | null {
  const { run } = useAppTools();
  const base = `${projectId}:${milestoneId ?? 'browser'}`;
  const [held, setHeld] = useState<{ base: string; picture: ProjectPicture } | null>(null);
  // The time of the picture on screen, read when the next one is asked for.
  const heldAt = useRef<string | undefined>(undefined);

  // Reading a file through the runtime is an outside effect.
  useEffect(() => {
    if (!active) return;
    let current = true;
    void run(PROJECTS_TOOL, { action: 'picture', projectId, ...(milestoneId ? { milestoneId } : {}), ...(heldAt.current ? { newerThan: heldAt.current } : {}) })
      .then((result) => {
        const details = result.details as { dataUrl?: unknown; at?: unknown } | undefined;
        return typeof details?.dataUrl === 'string' && typeof details.at === 'string' ? { dataUrl: details.dataUrl, at: details.at } : null;
      }, () => null)
      .then((picture) => {
        // No newer picture leaves the one on screen where it is.
        if (!current || !picture) return;
        heldAt.current = picture.at;
        setHeld({ base, picture });
      });
    return () => { current = false; };
  }, [active, base, key, milestoneId, projectId, run]);

  return active && held?.base === base ? held.picture : null;
}
