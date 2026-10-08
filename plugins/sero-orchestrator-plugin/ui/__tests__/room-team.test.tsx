// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberConfigurationChange } from '../../shared/room-amendment-types';
import type { RoomRevision } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import { RoomTeam } from '../components/RoomTeam';
import { teamRows } from '../lib/room-team';

vi.mock('../lib/use-orchestrator-index', () => ({ useStateDir: () => null }));

const AT = '2026-10-01T09:00:00.000Z';

function member(id: string, extra: Partial<RoomMember> = {}): RoomMember {
  return {
    id,
    displayName: id,
    status: 'working',
    mandate: { role: 'Reviewer' },
    configuration: { model: 'luna', tools: ['read', 'search'] },
    replacedByMemberId: null,
    ...extra,
  } as RoomMember;
}

function change(state: MemberConfigurationChange['state'], extra: Partial<MemberConfigurationChange> = {}): MemberConfigurationChange {
  return { revisionId: 'rev-1', state, fields: [], adds: [], reason: null, grantRevision: null, workPaused: false, updatedAt: AT, ...extra };
}

const rowOf = (m: RoomMember, ...others: RoomMember[]) => {
  const all = [m, ...others];
  return teamRows(all.map((x) => x.id), new Map(all.map((x) => [x.id, x])), [])[0];
};

describe('Team rows', () => {
  it('shows a pending model under the effective one without replacing it', () => {
    const row = rowOf(member('Rhea', { configurationChange: change('pending', { fields: [{ field: 'model', value: 'sol' }] }) }));
    expect(row).toMatchObject({ model: 'luna', pendingModel: 'sol', note: 'Applies at the next safe point', decide: null });
  });

  it('holds a tool addition for approval with one decision', () => {
    const row = rowOf(member('Rhea', { configurationChange: change('held', { fields: [{ field: 'tools', value: ['read', 'search', 'shell'] }] }) }));
    expect(row).toMatchObject({ tools: 'read, search', pendingTools: 'add shell', note: 'Needs your approval', decide: { revisionId: 'rev-1' } });
  });

  it('names the revision once applied and keeps the old values once declined', () => {
    expect(rowOf(member('Rhea', { configurationChange: change('applied', { grantRevision: 4 }) })).note).toBe('Revision 4');
    const declined = rowOf(member('Rhea', { configurationChange: change('declined', { fields: [{ field: 'model', value: 'sol' }] }) }));
    expect(declined).toMatchObject({ model: 'luna', pendingModel: null, note: 'Change declined' });
  });

  it('mutes a retired member and ties it to its replacement', () => {
    const iris = member('Iris', { status: 'retired', replacedByMemberId: 'Kai' });
    const kai = member('Kai', { replacedFromMemberId: 'Iris' });
    const rows = teamRows(['Iris', 'Kai'], new Map([['Iris', iris], ['Kai', kai]]), []);
    expect(rows[0]).toMatchObject({ retired: true, line: 'Retired. Replaced by Kai', history: true, status: null });
    expect(rows[1].line).toBe("Reviewer. Starts from Iris's handover");
  });

  it('lists a held new member that has no record yet, and asks once per revision', () => {
    const revision = {
      id: 'rev-2',
      proposal: { kind: 'add-member', member: { displayName: 'Ode', role: 'Tester', model: 'sol', tools: ['read'] } },
      amendment: { state: 'held' },
    } as unknown as RoomRevision;
    const rows = teamRows(['Rhea'], new Map([['Rhea', member('Rhea')]]), [revision]);
    expect(rows[1]).toMatchObject({ name: 'Ode', model: 'sol', note: 'Needs your approval', decide: { revisionId: 'rev-2' } });
  });
});

describe('Team decisions', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('sends Approve and Decline for the held revision', () => {
    const dispatch = vi.fn().mockResolvedValue(null);
    const held = member('Rhea', { configurationChange: change('held') });
    act(() => root.render(
      <RoomTeam roomId="room-1" memberIds={['Rhea']} members={new Map([['Rhea', held]])} busy={false} dispatch={dispatch} onOpenMember={() => {}} />,
    ));
    const press = (label: string) => act(() => {
      [...host.querySelectorAll('button')].find((button) => button.textContent === label)?.click();
    });
    press('Approve');
    press('Decline');
    expect(dispatch).toHaveBeenNthCalledWith(1, { action: 'approve_revision', roomId: 'room-1', revisionId: 'rev-1' });
    expect(dispatch).toHaveBeenNthCalledWith(2, { action: 'decline_revision', roomId: 'room-1', revisionId: 'rev-1' });
  });
});
