import { describe, expect, it, vi } from 'vitest';
import type { ShellTab } from '../components/ShellTopBar';
import { WORKFLOW_LABEL } from '../../shared/labels';
import { shellControlsFor } from '../lib/shell-controls';

const handlers = {
  reflectAll: vi.fn(),
  newWorkflow: vi.fn(),
  newRoom: vi.fn(),
  newGoal: vi.fn(),
};

describe('Orchestrator shell controls', () => {
  it('shows Workflow controls only in Workflows', () => {
    const controls = shellControlsFor('workflows', handlers, true);
    expect(controls.actions).toEqual([{ label: 'Reflect all', onSelect: handlers.reflectAll, disabled: true }]);
  });

  it('puts the three create buttons in the top bar on Home', () => {
    const controls = shellControlsFor('home', handlers, false);
    expect(controls.actions.map((action) => action.label)).toEqual([WORKFLOW_LABEL, 'Room', 'Goal']);
    expect(controls.actions.every((action) => action.kind === 'start')).toBe(true);
  });

  // The Goal start opens the overview; it must never open one Goal's detail.
  it('runs the handler the app binds to the Goals overview', () => {
    const goal = shellControlsFor('home', handlers, false).actions.find((a) => a.label === 'Goal');
    goal?.onSelect();
    expect(handlers.newGoal).toHaveBeenCalledTimes(1);
  });

  it.each<ShellTab>(['rooms', 'goals', 'library', 'catalog'])('shows no controls in %s', (tab) => {
    expect(shellControlsFor(tab, handlers, false)).toEqual({ actions: [] });
  });
});
