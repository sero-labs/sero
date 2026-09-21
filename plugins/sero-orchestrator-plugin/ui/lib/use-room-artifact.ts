/**
 * Reads one published artifact's content through the Room's own surface.
 *
 * The panel follows the Room record directly, and the record carries an
 * artifact's title, kind and author — but not its content, which lives in a
 * file the renderer cannot open. So this asks the Room app tool, which resolves
 * the id against the Room that is asking and refuses an artifact belonging to
 * another one.
 *
 * Read ON DEMAND, not on render. A plan is read when its card opens, which is
 * the only moment the text is wanted, and a read that fails is remembered as
 * "cannot be read" beside the artifact rather than as an empty document.
 */

import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

/** The user's Room control tool — the surface that already owns Room actions. */
const ROOM_APP_TOOL = 'rooms';

export type ArtifactReadState =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'unreadable'; reason: string };

export interface RoomArtifactReader {
  /** What is known about each artifact read so far, keyed by artifact id. */
  reads: Record<string, ArtifactReadState>;
  /** Reads one artifact, if it has not been read already. */
  read(artifactId: string): void;
}

export function useRoomArtifact(roomId: string | null): RoomArtifactReader {
  const { run } = useAppTools();
  const [reads, setReads] = useState<Record<string, ArtifactReadState>>({});

  const settle = useCallback((artifactId: string, state: ArtifactReadState) => {
    setReads((current) => ({ ...current, [artifactId]: state }));
  }, []);

  const read = useCallback((artifactId: string) => {
    if (!roomId) return;
    setReads((current) => {
      // One read per artifact: opening a fold twice must not start a second
      // request, and a failure must not be retried on every render.
      if (current[artifactId]) return current;
      return { ...current, [artifactId]: { status: 'loading' } };
    });
    void (async () => {
      try {
        const result = await run(ROOM_APP_TOOL, { action: 'read_artifact', roomId, artifactId });
        const details = result.details as { ok?: unknown; content?: unknown; error?: unknown } | null;
        const content = typeof details?.content === 'string' ? details.content : null;
        if (details?.ok === true && content !== null) {
          settle(artifactId, { status: 'ready', content });
          return;
        }
        settle(artifactId, {
          status: 'unreadable',
          reason: typeof details?.error === 'string' ? details.error : 'This artifact could not be read.',
        });
      } catch (cause) {
        settle(artifactId, {
          status: 'unreadable',
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();
  }, [roomId, run, settle]);

  return { reads, read };
}
