/**
 * The one-or-two-glyph face label for a member (prototype: ◎ C R 1 2 T M),
 * plus the runtime-lifecycle → kit-dot mapping every member surface shares.
 */

import type { MemberStatus as RoomMemberStatus } from '../../shared/room-types';
import type { MemberStatus as KitStatus } from '../components/room-kit';

/** The runtime's eleven member states in the kit's six-dot vocabulary. */
export const MEMBER_DOT: Record<RoomMemberStatus, KitStatus> = {
  starting: 'idle',
  idle: 'idle',
  working: 'working',
  waiting: 'waiting',
  blocked: 'blocked',
  suspended: 'suspended',
  retiring: 'idle',
  retired: 'idle',
  completed: 'done',
  failed: 'blocked',
  offline: 'idle',
};

/**
 * The status in words. The dot carries it visually; a screen reader and anybody
 * who cannot tell amber from green need it written down.
 */
export const MEMBER_STATUS_LABEL: Record<RoomMemberStatus, string> = {
  starting: 'starting',
  idle: 'idle',
  working: 'working',
  waiting: 'waiting',
  blocked: 'needs you',
  suspended: 'suspended',
  retiring: 'retiring',
  retired: 'retired',
  completed: 'finished',
  failed: 'failed',
  offline: 'offline',
};

/**
 * A trailing number wins ("Implementer 2" → 2); otherwise the initial of the
 * last word ("Security reviewer" → R). The Conductor is always ◎.
 */
export function memberGlyph(name: string, isConductor?: boolean): string {
  if (isConductor) return '◎';
  const trimmed = name.trim();
  const number = /(\d+)\s*$/.exec(trimmed)?.[1];
  if (number) return number.slice(-2);
  const words = trimmed.split(/\s+/);
  return (words[words.length - 1]?.[0] ?? '?').toUpperCase();
}
