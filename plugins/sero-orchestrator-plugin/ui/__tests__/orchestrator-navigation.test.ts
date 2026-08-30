import { describe, expect, it } from 'vitest';
import {
  orchestratorViewId,
  parseOrchestratorView,
  type OrchestratorView,
} from '../lib/orchestrator-navigation';

describe('Orchestrator navigation routes', () => {
  const views: OrchestratorView[] = [
    { mode: 'home' },
    { mode: 'detail', loopId: null },
    { mode: 'detail', loopId: 'loop-12' },
    { mode: 'create' },
    { mode: 'rooms', roomId: null },
    { mode: 'rooms', roomId: 'room-7' },
    { mode: 'rooms', roomId: 'room-7', memberId: 'member-3' },
    { mode: 'rooms', roomId: 'room-7', roomView: 'timeline' },
    { mode: 'rooms', roomId: 'room-7', roomView: 'result', memberId: 'member-3' },
    { mode: 'room-create' },
    { mode: 'goals', goalId: null },
    { mode: 'goals', goalId: 'goal-8f2' },
    { mode: 'library', tab: 'mine' },
    { mode: 'library', tab: 'catalog' },
  ];

  it.each(views)('round-trips $mode routes', (view) => {
    expect(parseOrchestratorView(orchestratorViewId(view))).toEqual(view);
  });

  it('ignores malformed and unknown Room options', () => {
    expect(parseOrchestratorView('settings')).toBeNull();
    expect(parseOrchestratorView('rooms/room-7?view=unknown')).toEqual({
      mode: 'rooms',
      roomId: 'room-7',
    });
  });
});
