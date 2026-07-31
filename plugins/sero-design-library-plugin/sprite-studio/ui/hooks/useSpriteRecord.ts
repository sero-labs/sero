import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useRef, useState } from 'react';

import type { AnimationRecord, CharacterRecord } from '../../shared/character';
import { SPRITE_TOOL } from '../lib/requests';

/**
 * The full record, read on demand.
 *
 * Reactive state carries summaries, because a character carries far more than
 * an index should — its ingestion measurements, its style notes, and for an
 * animation every frame with its findings and its timing. The screens that need
 * that detail ask for it; the shelf and the rails never do.
 *
 * A record is re-read when its summary's `updatedAt` moves, which is every
 * write. Nothing polls, and nothing mirrors a record into state.
 */

function useToolRecord<T>(
  identity: string,
  version: number,
  params: Record<string, unknown> | null,
  pick: (details: Record<string, unknown>) => unknown,
): T | null {
  const tools = useAppTools();
  const latest = useRef({ tools, params });
  useEffect(() => {
    latest.current = { tools, params };
  });

  // Held with the identity it belongs to. A different record clears during
  // render rather than after an effect, because painting one character's
  // measurements under another's name for a frame is worse than painting none.
  const [loaded, setLoaded] = useState<{ identity: string; value: T | null }>({
    identity,
    value: null,
  });
  if (loaded.identity !== identity) setLoaded({ identity, value: null });

  useEffect(() => {
    if (identity === '') return;
    let active = true;
    const request = latest.current.params;
    if (request === null) return;

    void latest.current.tools
      .run(SPRITE_TOOL, request)
      .then((result) => {
        const value = pick(result.details ?? {});
        // Kept only while it is still the record being asked about: a rail click
        // during the read would otherwise land the old one on the new screen.
        if (active) setLoaded({ identity, value: (value ?? null) as T | null });
      })
      .catch(() => {
        if (active) setLoaded({ identity, value: null });
      });

    return () => {
      active = false;
    };
    // `version` is not read in here — it is the signal that the record changed.
  }, [identity, version, pick]);

  return loaded.identity === identity ? loaded.value : null;
}

const pickCharacter = (details: Record<string, unknown>) => details.character;
const pickAnimation = (details: Record<string, unknown>) => details.animation;

/**
 * Several animations at once.
 *
 * The plan dialog needs each animation's motion instruction and the export
 * screen needs every frame's duration, both of which are on the record rather
 * than the summary. A batch is five of them, so the list is fetched together
 * rather than through one hook per row — which the rules of hooks would not
 * allow anyway.
 */
export function useAnimationRecords(
  characterId: string | undefined,
  animationIds: string[],
): Map<string, AnimationRecord> {
  const tools = useAppTools();
  const latest = useRef(tools);
  useEffect(() => {
    latest.current = tools;
  });

  const key = animationIds.join(',');
  const [records, setRecords] = useState<Map<string, AnimationRecord>>(new Map());

  useEffect(() => {
    if (characterId === undefined || key === '') {
      setRecords(new Map());
      return;
    }
    let active = true;
    void Promise.all(
      key.split(',').map((animationId) =>
        latest.current
          .run(SPRITE_TOOL, { action: 'record', characterId, animationId })
          .then((result) => (result.details ?? {}).animation as AnimationRecord | undefined)
          .catch(() => undefined),
      ),
    ).then((found) => {
      if (!active) return;
      setRecords(
        new Map(
          found.flatMap((record) => (record === undefined ? [] : [[record.id, record] as const])),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [characterId, key]);

  return records;
}

export function useCharacterRecord(
  characterId: string | undefined,
  updatedAt: number | undefined,
): CharacterRecord | null {
  return useToolRecord<CharacterRecord>(
    characterId ?? '',
    updatedAt ?? 0,
    characterId === undefined ? null : { action: 'record', characterId },
    pickCharacter,
  );
}

export function useAnimationRecord(
  characterId: string | undefined,
  animationId: string | undefined,
  updatedAt: number | undefined,
): AnimationRecord | null {
  const ready = characterId !== undefined && animationId !== undefined;
  return useToolRecord<AnimationRecord>(
    ready ? `${characterId}:${animationId}` : '',
    updatedAt ?? 0,
    ready ? { action: 'record', characterId, animationId } : null,
    pickAnimation,
  );
}
