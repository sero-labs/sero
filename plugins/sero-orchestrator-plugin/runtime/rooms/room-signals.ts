/**
 * What a Room is holding for its next pass.
 *
 * Rooms are event-driven: something happens, a member becomes ready, a pass
 * runs. This is the book of what has happened since the last pass — kept apart
 * from the coordinator so that file stays inside the size limit, and so the
 * bookkeeping rules live in one place instead of four methods.
 *
 * Transient by design. A signal is an intention to run NOW; after a restart the
 * durable record is what says who owes a turn.
 */

import type { ReadySignal } from './room-scheduler';
import type { RoomRecord } from './room-state';

/** The last thing that happened in a Room — what a lead's turn is a response to. */
export function quietMark(record: RoomRecord): string {
  return record.runtime.lastProgressAt ?? record.runtime.startedAt ?? '';
}

export class RoomSignalBook {
  private readonly signals = new Map<string, ReadySignal[]>();
  /** The progress mark each Room's lead was last woken on. */
  private readonly quietWakes = new Map<string, string>();

  /** Keeps one signal per member and reason; the earliest arrival wins a repeat. */
  add(roomId: string, incoming: ReadySignal[]): void {
    if (incoming.length === 0) return;
    const merged = [...(this.signals.get(roomId) ?? [])];
    for (const signal of incoming) {
      if (merged.some((held) => held.memberId === signal.memberId && held.reason === signal.reason)) continue;
      merged.push(signal);
    }
    this.signals.set(roomId, merged);
  }

  /** Signals whose member is not already taking a turn. */
  ready(roomId: string, isRunning: (memberId: string) => boolean): ReadySignal[] {
    return (this.signals.get(roomId) ?? []).filter((signal) => !isRunning(signal.memberId));
  }

  /**
   * Drops only the signals for members that actually started. A member held back
   * by capacity keeps its signal, so it runs as soon as a slot frees rather than
   * waiting for another event that may never come.
   */
  consume(roomId: string, memberIds: string[]): void {
    const started = new Set(memberIds);
    const kept = (this.signals.get(roomId) ?? []).filter((signal) => !started.has(signal.memberId));
    if (kept.length === 0) this.signals.delete(roomId);
    else this.signals.set(roomId, kept);
  }

  /**
   * True the first time it is asked about a given mark.
   *
   * The mark is the last thing that HAPPENED in the Room, so the lead is woken
   * once per event and never by its own silence — otherwise a Conductor with
   * nothing to add would be woken by the quiet it just created, for ever.
   */
  claimQuietWake(roomId: string, mark: string): boolean {
    if (this.quietWakes.get(roomId) === mark) return false;
    this.quietWakes.set(roomId, mark);
    return true;
  }

  forget(roomId: string): void {
    this.signals.delete(roomId);
    this.quietWakes.delete(roomId);
  }
}
