/**
 * The Architect's watched project index, as surfaces outside the plugin read it.
 *
 * The workspace tree needs to know which workspace holds a project that needs
 * the user, and to say so in the Architect's own words. It cannot import from a
 * plugin, so the fields it depends on are declared here and the plugin's own
 * `ArchitectIndex` is checked against this view. A field the tree relies on
 * changing shape is then a typecheck failure in the plugin, not a blank row.
 *
 * This is a subset on purpose: spend, phase and milestone counts belong to the
 * Architect's own UI.
 */

import type { ActivityState } from './activity-state';

export const ARCHITECT_APP_ID = 'architect';

/** The derived activity of one project, written by the Architect on every save. */
export interface ArchitectActivityView {
  state: ActivityState;
  /** The state that matters, in the words the projects list shows. */
  headline: string;
  /** Whose work it is. */
  owner: string;
  /** What the user must do. Absent when nothing is needed. */
  action?: string;
}

/** One project row of the index. */
export interface ArchitectProjectView {
  id: string;
  name: string;
  /** The workspace the project builds in, or null before one is chosen. */
  workspaceId: string | null;
  activity: ArchitectActivityView;
}

/** The watched index file, as an outside reader consumes it. */
export interface ArchitectIndexView {
  projects: ArchitectProjectView[];
}
