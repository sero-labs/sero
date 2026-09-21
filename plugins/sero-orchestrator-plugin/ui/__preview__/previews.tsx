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
import { LoopEndingPreview, MemberInfoPreview, RoomResultPreview } from './read-the-outcome-fixture';

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
  {
    id: 'loop-ending',
    title: 'A Workflow ending · the Result row and the request',
    note: 'One Result row above the settings for every ending, then the objective with the request that started it folded under it. Frame 1 of 3-read-the-outcome.',
    width: 1440,
    render: () => <LoopEndingPreview />,
  },
  {
    id: 'room-result',
    title: 'A Room result · the result, then the plan it produced',
    note: 'The Room closing line, then the Conductor plan open at its first section with the author others folded, then the artifacts and the cost. Frame 3 of 3-read-the-outcome.',
    width: 1440,
    render: () => <RoomResultPreview />,
  },
  {
    id: 'member-info',
    title: 'A member Info tab · what it is, then its terms',
    note: 'Model, tools, access and spend lead; the working instructions and the usage fold; and a member over its own limit rings as a fault. Frame 4 of 3-read-the-outcome.',
    width: 1440,
    render: () => <MemberInfoPreview />,
  },
];
