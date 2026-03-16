/**
 * PlanningActivityPanel — live progress feed for the planning phase.
 *
 * Thin wrapper around ActivityPanel with blue theme.
 */

import type { PlanningProgress } from '../../shared/types';
import { ActivityPanel, type ActivityPanelTheme } from './ActivityPanel';

const THEME: ActivityPanelTheme = {
  primary: '#3b82f6',
  primaryText: '#60a5fa',
  border: 'rgba(59, 130, 246, 0.2)',
  background: 'rgba(59, 130, 246, 0.04)',
  agentRunningBg: 'rgba(59, 130, 246, 0.12)',
};

export function PlanningActivityPanel({ progress }: { progress?: PlanningProgress }) {
  return (
    <ActivityPanel
      theme={THEME}
      data={progress}
      defaultPhase="Planning in progress…"
      fallbackText="Inspecting the codebase and generating an implementation plan with subtasks."
      showLogFeed
    />
  );
}
