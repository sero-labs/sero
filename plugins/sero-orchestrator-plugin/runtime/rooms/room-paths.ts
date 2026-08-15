/**
 * File layout for Room mode (architecture.md §2.3), under the Orchestrator
 * state dir:
 *
 *   rooms/index.json                    — room summaries (watched by the UI)
 *   rooms/<roomId>/room.json            — definition, runtime, brief, delivery
 *   rooms/<roomId>/members/<id>.json    — one file per member
 *   rooms/<roomId>/messages/<page>.json — durable message pages
 *   rooms/<roomId>/revisions.json       — accepted revision history
 *   rooms/<roomId>/timeline.jsonl       — append-only audit timeline
 */

import path from 'node:path';

export interface RoomPaths {
  root: string;
  index: string;
  transaction: string;
  roomDir(roomId: string): string;
  room(roomId: string): string;
  member(roomId: string, memberId: string): string;
  messagePage(roomId: string, page: number): string;
  revisions(roomId: string): string;
  timeline(roomId: string): string;
  /** Rotated timeline file; generation 1 is the most recent rotation. */
  timelineRotation(roomId: string, generation: number): string;
}

/**
 * Containment chokepoint: every id-derived path must resolve to a DIRECT child
 * of its base, so a crafted room or member id can never read, write, or
 * recursively delete outside the rooms tree.
 */
function child(base: string, id: string): string {
  const resolved = path.resolve(base, id);
  if (path.dirname(resolved) !== path.resolve(base)) {
    throw new Error(`unsafe room path segment: ${JSON.stringify(id)}`);
  }
  return resolved;
}

export function createRoomPaths(stateDir: string): RoomPaths {
  const root = path.join(stateDir, 'rooms');
  const roomDir = (roomId: string) => child(root, roomId);
  return {
    root,
    index: path.join(root, 'index.json'),
    transaction: path.join(root, 'transaction.json'),
    roomDir,
    room: (roomId) => path.join(roomDir(roomId), 'room.json'),
    member: (roomId, memberId) => `${child(path.join(roomDir(roomId), 'members'), memberId)}.json`,
    messagePage: (roomId, page) => path.join(roomDir(roomId), 'messages', `${page}.json`),
    revisions: (roomId) => path.join(roomDir(roomId), 'revisions.json'),
    timeline: (roomId) => path.join(roomDir(roomId), 'timeline.jsonl'),
    timelineRotation: (roomId, generation) => path.join(roomDir(roomId), `timeline.${generation}.jsonl`),
  };
}
