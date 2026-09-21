import { WORKFLOW_LABEL } from '../../shared/labels';
import type { ShellAction, ShellTab } from '../components/ShellTopBar';

interface ShellControlHandlers {
  /** The three create buttons the proposal puts in the top bar on Home. */
  newWorkflow: () => void;
  newRoom: () => void;
  newGoal: () => void;
}

export interface ShellControls {
  actions: ShellAction[];
}

export function shellControlsFor(
  tab: ShellTab,
  handlers: ShellControlHandlers,
): ShellControls {
  if (tab === 'home') {
    return {
      actions: [
        { label: WORKFLOW_LABEL, onSelect: handlers.newWorkflow, kind: 'start' },
        { label: 'Room', onSelect: handlers.newRoom, kind: 'start' },
        { label: 'Goal', onSelect: handlers.newGoal, kind: 'start' },
      ],
    };
  }
  return { actions: [] };
}
