/**
 * Naming another member.
 *
 * A member is addressed by its id — `conductor`, `implementer` — but it reads
 * the roster as names, and it writes what it read: `--to Mara`. Refusing that
 * costs a turn and teaches nothing, because the refusal did not say what the
 * ids are. So a reference resolves by id first, then by the name the roster
 * shows, and only when exactly one member answers to it.
 */

import type { RoomMember } from './room-types';

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** "Mara — Conductor" → "mara". The part a person types when they mean a member. */
function shortName(displayName: string): string {
  return normalise(displayName.split('—')[0] ?? displayName);
}

/** The member this reference names, or undefined when it names none or several. */
export function resolveMemberRef(members: RoomMember[], ref: string): RoomMember | undefined {
  const wanted = normalise(ref);
  if (!wanted) return undefined;

  const byId = members.find((member) => normalise(member.id) === wanted);
  if (byId) return byId;

  const byName = members.filter(
    (member) => normalise(member.displayName) === wanted || shortName(member.displayName) === wanted,
  );
  return byName.length === 1 ? byName[0] : undefined;
}

/**
 * References that mean the person running the Room rather than a member.
 *
 * The user is not on the roster, so addressing them with `ask` can only ever be
 * refused. A Conductor that reads "there is no member user" and stops there
 * blocks the whole Room on a question nobody can deliver — which is what
 * happened in a live Room, on the one question the brief had promised to ask.
 */
const USER_REFS = ['user', 'the user', 'you', 'human', 'owner', 'operator'];

/** Names the user rather than a member, so the refusal can point somewhere useful. */
export function refersToUser(ref: string): boolean {
  return USER_REFS.includes(normalise(ref));
}

/** What to say when a reference names nobody: the ids, with the names beside them. */
export function memberRefHelp(members: RoomMember[]): string {
  const roster = members
    .filter((member) => member.status !== 'retired')
    .map((member) => `${member.id} (${member.displayName})`)
    .join(', ');
  return roster.length > 0 ? ` Members: ${roster}.` : '';
}
