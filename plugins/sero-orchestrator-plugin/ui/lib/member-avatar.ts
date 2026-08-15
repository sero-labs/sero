import { createAvatar } from '@dicebear/core';
import * as botttsNeutral from '@dicebear/bottts-neutral';

const avatars = new Map<string, string>();

/** A member key always maps to the same Bottts Neutral avatar. */
export function memberAvatar(memberKey: string): string {
  const seed = `sero-room-member:${memberKey}`;
  const cached = avatars.get(seed);
  if (cached) return cached;

  const avatar = createAvatar(botttsNeutral, { seed }).toDataUri();
  avatars.set(seed, avatar);
  return avatar;
}
