/**
 * The preview registry. Add an entry to put a component on the harness page.
 *
 * A preview is a plain render function: no host bridge, no module federation,
 * no live workflow. Give it everything it needs through props and a fixture.
 */

import { PlanMap } from '../components/PlanMap';
import type { PlanMapStepsPerRow } from '../lib/plan-map-layout';
import { previewLoop } from './fixture';
import { HomePreview, RoomsPreview, WorkflowsListPreview } from './activity-fixture';
import { RoomHoldPreview, WorkflowPagePreview } from './act-on-it-fixture';

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

export const PREVIEWS: Preview[] = [
  ...PLAN_MAP_DENSITIES.map((stepsPerRow) => ({
    id: `plan-map-${stepsPerRow}`,
    title: `Plan map · ${stepsPerRow} ${stepsPerRow === 1 ? 'step' : 'steps'} in each row`,
    note: 'Every stage shape at once: fan out, gates, a branch with a skipped path, two parallel stages, and a loop back.',
    width: 1160,
    render: () => <PlanMap loop={previewLoop} stepsPerRow={stepsPerRow} />,
  })),
  {
    id: 'home',
    title: 'Home · status line, then what needs you',
    note: 'The status line is derived by the same rule as the list, so it cannot say "0 active" over an active Workflow. Three suggested changes to one Workflow group under its name.',
    width: 1160,
    render: () => <HomePreview />,
  },
  {
    id: 'workflows-list',
    title: 'Workflows · the full-width list',
    note: 'Whole titles, the state in words, and what each one waits for. A row opens its own page.',
    width: 1160,
    render: () => <WorkflowsListPreview />,
  },
  {
    id: 'workflow-page',
    title: 'A Workflow · its settings and its plan',
    note: 'The state line, the labelled settings line, and steps that lead with their Result. Context and Delivery open from their values; the instruction opens from the chevron.',
    width: 1160,
    render: () => <WorkflowPagePreview />,
  },
  {
    id: 'room-hold',
    title: 'A Room on hold · the question once, the actions once',
    note: 'One card holds the question, the members\' own words and the three controls. The header carries none of them while it is shown.',
    width: 1160,
    render: () => <RoomHoldPreview />,
  },
  {
    id: 'rooms',
    title: 'Rooms · what each Room waits for',
    note: 'The row says what it waits for and for how long, and keeps its member avatars.',
    width: 1160,
    render: () => <RoomsPreview />,
  },
];
