import type { RoomMember } from '../../shared/room-types';
import { RoomTeam } from '../components/RoomTeam';
const m = (id: string, name: string, role: string, model: string, tools: string[], extra: object = {}) => ({
  id, displayName: name, status: 'working', mandate: { role }, configuration: { model, tools }, replacedByMemberId: null, ...extra,
}) as unknown as RoomMember;
const chg = (state: string, fields: unknown[]) => ({ revisionId: 'r1', state, fields, adds: [], reason: null, grantRevision: 4, workPaused: false, updatedAt: '' });
export const teamPreview = (state: 'pending' | 'held' | 'applied' | 'declined') => {
  const ms = [
    m('nova', 'Nova', 'Conductor', 'gpt-5.6-sol', ['read', 'search', 'edit']),
    m('rhea', 'Rhea', 'Reviewer', 'gpt-5.6-luna', ['read', 'search'], { configurationChange: chg(state, state === 'pending' ? [{ field: 'model', value: 'gpt-5.6-sol' }] : [{ field: 'tools', value: ['read', 'search', 'shell'] }]) }),
    m('iris', 'Iris', 'Reviewer', 'gpt-5.6-luna', ['read', 'search'], { status: 'retired', replacedByMemberId: 'kai' }),
    m('kai', 'Kai', 'Reviewer', 'gpt-5.6-sol', ['read', 'search'], { replacedFromMemberId: 'iris' }),
  ];
  return <RoomTeam roomId="r" memberIds={ms.map((x) => x.id)} members={new Map(ms.map((x) => [x.id, x]))} busy={false} dispatch={async () => null} onOpenMember={() => {}} />;
};
