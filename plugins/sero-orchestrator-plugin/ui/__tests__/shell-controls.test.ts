import { describe, expect, it, vi } from 'vitest';
import type { ShellTab } from '../components/ShellTopBar';
import { shellControlsFor } from '../lib/shell-controls';

const handlers = {
  reflectAll: vi.fn(),
};

describe('Orchestrator shell controls', () => {
  it('shows Workflow controls only in Workflows', () => {
    const controls = shellControlsFor('workflows', handlers, true);
    expect(controls.actions).toEqual([{ label: 'Reflect all', onSelect: handlers.reflectAll, disabled: true }]);
  });

  it.each<ShellTab>(['home', 'rooms', 'goals', 'library', 'catalog'])('shows no Workflow controls in %s', (tab) => {
    expect(shellControlsFor(tab, handlers, false)).toEqual({ actions: [] });
  });
});
