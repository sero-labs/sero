/**
 * The preview registry. Add an entry to put a component on the harness page.
 *
 * A preview is a plain render function: no host bridge, no module federation,
 * no live workflow. Give it everything it needs through props and a fixture.
 */

import { PlanMap } from '../components/PlanMap';
import type { PlanMapStepsPerRow } from '../lib/plan-map-layout';
import { previewLoop } from './fixture';

export interface Preview {
  id: string;
  title: string;
  /** What the preview is for, so the page explains itself. */
  note: string;
  /** Width the component is given, in pixels. Matches the real panel. */
  width: number;
  render: () => React.ReactNode;
}

const PLAN_MAP_DENSITIES: PlanMapStepsPerRow[] = [4, 3, 2, 1];

export const PREVIEWS: Preview[] = PLAN_MAP_DENSITIES.map((stepsPerRow) => ({
  id: `plan-map-${stepsPerRow}`,
  title: `Plan map · ${stepsPerRow} ${stepsPerRow === 1 ? 'step' : 'steps'} in each row`,
  note: 'Every stage shape at once: fan out, gates, a branch with a skipped path, two parallel stages, and a loop back.',
  width: 1160,
  render: () => <PlanMap loop={previewLoop} stepsPerRow={stepsPerRow} />,
}));
