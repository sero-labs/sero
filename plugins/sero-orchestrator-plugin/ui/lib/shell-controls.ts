import type { ShellAction, ShellTab } from '../components/ShellTopBar';

interface ShellControlHandlers {
  reflectAll: () => void;
}

export interface ShellControls {
  actions: ShellAction[];
}

export function shellControlsFor(
  tab: ShellTab,
  handlers: ShellControlHandlers,
  reflectDisabled: boolean,
): ShellControls {
  if (tab === 'workflows') {
    return {
      actions: [{ label: 'Reflect all', onSelect: handlers.reflectAll, disabled: reflectDisabled }],
    };
  }
  return { actions: [] };
}
