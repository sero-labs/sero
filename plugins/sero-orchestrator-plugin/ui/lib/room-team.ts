/**
 * The Team table's facts, one row per member (and per member still joining).
 *
 * Kept out of the component so each rule can be tested without a DOM: which
 * value is effective, which is only pending, what the State column says, and
 * whether the row carries Approve and Decline. A change in flight never edits
 * the effective value; it is shown beneath it.
 */

import type { RoomChangeValue, MemberConfigurationChange } from '../../shared/room-amendment-types';
import type { RoomRevision } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import { MEMBER_STATUS_LABEL } from './member-glyph';

export interface TeamRow {
  key: string;
  name: string;
  /** The line under the name: role, or the retirement or handover wording. */
  line: string;
  retired: boolean;
  /** Present for a member that exists, so a row can open it. */
  memberId: string | null;
  model: string;
  pendingModel: string | null;
  tools: string;
  pendingTools: string | null;
  /** The member's run status, or null for a member that has not joined yet. */
  status: string | null;
  /** The change wording under the status. */
  note: string | null;
  /** Set only on the row that carries Approve and Decline for its revision. */
  decide: { revisionId: string } | null;
  /** A retired member shows a History link in place of a state. */
  history: boolean;
}

const NOTE: Record<MemberConfigurationChange['state'], (change: MemberConfigurationChange) => string | null> = {
  pending: () => 'Applies at the next safe point',
  held: () => 'Needs your approval',
  applied: (change) => (change.grantRevision === null ? null : `Revision ${change.grantRevision}`),
  declined: () => 'Change declined',
};

const open = (change: MemberConfigurationChange | null | undefined): change is MemberConfigurationChange =>
  change?.state === 'pending' || change?.state === 'held';

const valueOf = (fields: RoomChangeValue[], field: RoomChangeValue['field']) => fields.find((entry) => entry.field === field)?.value;

/** What a tool change does to the list, as the drawing words it: `add shell`. */
function toolsMove(current: string[], next: string | string[] | undefined): string | null {
  if (!Array.isArray(next)) return null;
  const added = next.filter((tool) => !current.includes(tool)).map((tool) => `add ${tool}`);
  const removed = current.filter((tool) => !next.includes(tool)).map((tool) => `remove ${tool}`);
  const moves = [...added, ...removed];
  return moves.length > 0 ? moves.join(', ') : null;
}

function memberRow(member: RoomMember, byId: Map<string, RoomMember>): Omit<TeamRow, 'decide'> {
  const { configuration, configurationChange: change } = member;
  const retired = member.status === 'retired';
  const replacedBy = member.replacedByMemberId ? byId.get(member.replacedByMemberId) : undefined;
  const from = member.replacedFromMemberId ? byId.get(member.replacedFromMemberId) : undefined;
  const pending = open(change) ? change.fields : [];
  const model = valueOf(pending, 'model');
  let line = member.mandate.role;
  if (retired) line = replacedBy ? `Retired. Replaced by ${replacedBy.displayName}` : 'Retired';
  else if (from) line = `${member.mandate.role}. Starts from ${from.displayName}'s handover`;
  return {
    key: member.id,
    name: member.displayName,
    line,
    retired,
    memberId: member.id,
    model: configuration.model,
    pendingModel: typeof model === 'string' && model !== configuration.model ? model : null,
    tools: configuration.tools.join(', '),
    pendingTools: toolsMove(configuration.tools, valueOf(pending, 'tools')),
    status: retired ? null : capitalise(MEMBER_STATUS_LABEL[member.status]),
    note: retired || !change ? null : NOTE[change.state](change),
    history: retired,
  };
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A member still joining has no record yet; its state lives on the revision. */
function joiningRows(members: RoomMember[], revisions: RoomRevision[], byId: Map<string, RoomMember>): TeamRow[] {
  return revisions.flatMap((revision) => {
    const amendment = revision.amendment;
    const proposal = revision.proposal;
    if (!amendment || (amendment.state !== 'pending' && amendment.state !== 'held')) return [];
    if (proposal?.kind !== 'add-member' && proposal?.kind !== 'replace-member') return [];
    const joining = proposal.kind === 'add-member' ? proposal.member : proposal.replacement;
    const exists = members.some((member) => member.displayName === joining.displayName && member.configurationChange?.revisionId === revision.id);
    if (exists) return [];
    const from = proposal.kind === 'replace-member' ? byId.get(proposal.memberId) : undefined;
    return [{
      key: `joining:${revision.id}`,
      name: joining.displayName,
      line: from ? `${joining.role}. Starts from ${from.displayName}'s handover` : joining.role,
      retired: false,
      memberId: null,
      model: joining.model,
      pendingModel: null,
      tools: joining.tools.join(', '),
      pendingTools: null,
      status: null,
      note: amendment.state === 'held' ? 'Needs your approval' : 'Applies at the next safe point',
      decide: amendment.state === 'held' ? { revisionId: revision.id } : null,
      history: false,
    }];
  });
}

/** Member rows in roster order, then the members still joining. */
export function teamRows(memberIds: string[], members: Map<string, RoomMember>, revisions: RoomRevision[]): TeamRow[] {
  const known = memberIds.flatMap((id) => {
    const member = members.get(id);
    return member ? [member] : [];
  });
  const decided = new Set<string>();
  const rows: TeamRow[] = known.map((member) => {
    const row = memberRow(member, members);
    const change = member.configurationChange;
    const askFirst = change?.state === 'held' && member.status !== 'retired' && !decided.has(change.revisionId);
    if (askFirst && change) decided.add(change.revisionId);
    return { ...row, decide: askFirst && change ? { revisionId: change.revisionId } : null };
  });
  const joining = joiningRows(known, revisions, members).map((row) => {
    const revisionId = row.decide?.revisionId;
    if (!revisionId || !decided.has(revisionId)) {
      if (revisionId) decided.add(revisionId);
      return row;
    }
    return { ...row, decide: null };
  });
  return [...rows, ...joining];
}
