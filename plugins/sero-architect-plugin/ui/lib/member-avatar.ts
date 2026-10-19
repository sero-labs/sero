import { createAvatar } from '@dicebear/core';
import * as botttsNeutral from '@dicebear/bottts-neutral';

const avatars = new Map<string, string>();

/** The face the Room gives a member. The seed is the Orchestrator's, so both screens show one face. */
export function memberAvatar(memberKey: string): string {
  const seed = `sero-room-member:${memberKey}`;
  const cached = avatars.get(seed);
  if (cached) return cached;

  const avatar = createAvatar(botttsNeutral, { seed }).toDataUri();
  avatars.set(seed, avatar);
  return avatar;
}
