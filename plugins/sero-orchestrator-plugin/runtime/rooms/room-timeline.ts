/**
 * Append-only Room audit timeline (`timeline.jsonl`), bounded by rotation.
 *
 * It explains transitions for the UI and diagnostics. State is NEVER rebuilt by
 * replaying it (FR-030) — the current records are the source of truth, so the
 * store never reads this file to load a Room.
 */

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import type { RoomPaths } from './room-paths';
import type { RoomRetention } from './room-state';

export interface RoomTimeline {
  append(roomId: string, events: RoomTimelineEvent[]): Promise<void>;
  /** Newest first, for the UI. Never a source of state. */
  read(roomId: string, limit: number): Promise<RoomTimelineEvent[]>;
  /** Drops the cached size after a Room's files are deleted. */
  forget(roomId: string): void;
}

export function createRoomTimeline(paths: RoomPaths, retention: RoomRetention): RoomTimeline {
  // The runtime is the single writer, so the active file's size is tracked in
  // memory and only stat'd once per Room per process.
  const sizes = new Map<string, number>();

  const rotations = (roomId: string) =>
    Array.from({ length: retention.maxTimelineFiles }, (_, i) => paths.timelineRotation(roomId, i + 1));

  async function rotate(roomId: string): Promise<void> {
    const active = paths.timeline(roomId);
    if (!existsSync(active)) return;
    await rm(paths.timelineRotation(roomId, retention.maxTimelineFiles), { force: true });
    for (let generation = retention.maxTimelineFiles - 1; generation >= 1; generation -= 1) {
      const older = paths.timelineRotation(roomId, generation);
      if (existsSync(older)) await rename(older, paths.timelineRotation(roomId, generation + 1));
    }
    await rename(active, paths.timelineRotation(roomId, 1));
  }

  return {
    async append(roomId, events) {
      if (events.length === 0) return;
      const lines = events.map((event) => `${JSON.stringify(event)}\n`).join('');
      const bytes = Buffer.byteLength(lines, 'utf8');
      const active = paths.timeline(roomId);
      await mkdir(path.dirname(active), { recursive: true });
      let size = sizes.get(roomId) ?? (existsSync(active) ? (await stat(active)).size : 0);
      if (size + bytes > retention.maxTimelineBytes) {
        await rotate(roomId);
        size = 0;
      }
      await appendFile(active, lines, 'utf8');
      sizes.set(roomId, size + bytes);
    },

    async read(roomId, limit) {
      const events: RoomTimelineEvent[] = [];
      for (const file of [paths.timeline(roomId), ...rotations(roomId)]) {
        if (events.length >= limit || !existsSync(file)) continue;
        const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
        const parsed: RoomTimelineEvent[] = lines.map((line) => JSON.parse(line));
        events.push(...parsed.reverse().slice(0, limit - events.length));
      }
      return events;
    },

    forget(roomId) {
      sizes.delete(roomId);
    },
  };
}
