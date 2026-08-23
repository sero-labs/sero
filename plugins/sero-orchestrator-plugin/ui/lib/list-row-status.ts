import type { RoomStatus } from '../../shared/room-types';
import type { LoopStatus } from '../../shared/types';
import type { MemberStatus } from '../components/room-kit';

/** Room lifecycle mapped to the dot vocabulary used by the Room kit. */
export const ROOM_DOT: Record<RoomStatus, MemberStatus> = {
  adjusting: 'waiting',
  starting: 'working',
  running: 'working',
  pausing: 'waiting',
  paused: 'waiting',
  completing: 'working',
  ready: 'idle',
  draft: 'idle',
  completed: 'done',
  failed: 'blocked',
  cancelled: 'idle',
};

/** Workflow lifecycle mapped to the same dot vocabulary. */
export const LOOP_DOT: Record<LoopStatus, MemberStatus> = {
  active: 'working',
  blocked: 'waiting',
  draft: 'idle',
  complete: 'done',
  disabled: 'idle',
};
