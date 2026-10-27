import type { ToolProbe } from '../types';
import { architectProbe } from './architect';
import { architectProjectsProbe } from './architect-projects';
import { roomProbe } from './room';
import { roomsProbe } from './rooms';

/**
 * Each pair is one run, not the generic chat loop's: `room` refuses a session
 * that is not a Room member, so it runs inside the Room `rooms` builds
 * (../room-member.ts); `architect` refuses a session that is not a project's
 * owner, so it runs beside `architect_projects` (../architect-pair.ts).
 */
export const roomsArchitectProbes: ToolProbe[] = [roomsProbe, roomProbe, architectProbe, architectProjectsProbe];
