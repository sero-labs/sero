/**
 * The four surfaces #540 is judged on, at 1440, so each can be put beside
 * `5-start-something.html` frame by frame.
 *
 * Every value is a fixture taken from the drawing or the issue: the Frogger
 * Room's proposal for frame 3, its recorded planning cost for the same frame,
 * and the drawing's own Catalog entries for frame 4. Nothing is live.
 *
 * Each preview renders the REAL component. A preview that re-draws a surface
 * proves nothing about the surface.
 */

import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY } from '../../shared/defaults';
import type { CatalogEntry } from '../../shared/catalog-types';
import type { LibraryIndex } from '../../shared/types';
import type { SharedLoopDefinition } from '../../shared/library-types';
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import { RoomBriefForm } from '../components/RoomBriefForm';
import { RoomPreparing } from '../components/RoomPlanning';
import { RoomProposal } from '../components/RoomProposal';
import { CatalogBrowser } from '../components/CatalogBrowser';

/** Frame 3: the Frogger Room's proposal, read through `computeProposalSummary`. */
const PROPOSAL: RoomProposalSummary = {
  teamSize: 3,
  conductorCount: 1,
  maxWallClockMs: 15 * 60 * 1000,
  maxCostUsd: 5,
  access: [{ label: 'read-workspace' }],
  warnings: [],
  title: 'Frogger: Neon Crossing — Product and Technical Direction',
  approach:
    'Parallel workspace, gameplay, and usability analysis will be synthesised into one evidence-backed concept and challenged before delivery.',
  roles: [
    {
      key: 'nova',
      displayName: 'Nova — Product Conductor',
      responsibility: 'Coordinates evidence and turns competing perspectives into the final recommended direction.',
      isConductor: true,
    },
    {
      key: 'flux',
      displayName: 'Flux — Canvas Engineering Analyst',
      responsibility: 'Inspects the project and proposes an architecture grounded in its actual tooling.',
      isConductor: false,
    },
    {
      key: 'pulse',
      displayName: 'Pulse — Game and UX Critic',
      responsibility:
        'Develops distinctive gameplay options and independently challenges the final direction for clarity, accessibility, and scope.',
      isConductor: false,
    },
  ],
  teamRationale:
    'Three roles because the problem needs evidence, an architecture grounded in the workspace, and an independent challenge before delivery.',
};

/** What the Frogger Room recorded for designing its team (issue #540). */
const PLANNING_COST_USD = 0.11;

/** Frame 1: the New Room brief. */
export function RoomBriefPreview() {
  return <RoomBriefForm busy={false} onDesign={() => undefined} onCancel={() => undefined} />;
}

/** Frame 2: designing the team. */
export function RoomPlanningPreview() {
  return <RoomPreparing title="Designing your team" />;
}

/** Frame 3: the proposal, with the planning cost beside Start room. */
export function RoomProposalPreview() {
  return (
    <div className="flex flex-col p-4">
      <RoomProposal
        proposal={PROPOSAL}
        clamps={[]}
        planningCostUsd={PLANNING_COST_USD}
        busy={false}
        onStart={() => undefined}
        onAdjust={() => undefined}
        onDiscard={() => undefined}
        onOpenAdvanced={() => undefined}
      />
    </div>
  );
}

// ── Frame 4: the Catalog ─────────────────────────────────────

/** A portable definition carrying the step titles the entry will run. */
function definition(titles: string[]): SharedLoopDefinition {
  return {
    schemaVersion: 1,
    prompt: 'A curated Workflow.',
    title: titles[0] ?? 'Catalog entry',
    summary: 'A curated Workflow.',
    plan: {
      schemaVersion: 1,
      revision: 1,
      objective: 'Do the work the entry describes.',
      steps: titles.map((title, index) => ({
        id: `step-${index + 1}`,
        title,
        instructions: title,
        execution: { type: 'background-agent' },
      })),
    },
    triggers: [{ type: 'manual' }],
    limits: DEFAULT_LIMITS,
    logPolicy: DEFAULT_LOG_POLICY,
  };
}

const ADDED_REPO = 'var-folders-wh-0dgmrbl12xsdtvgf6xxq2w7r0000gn-t-marketing-ca';

/** Three entries: no steps, steps only, and the seven-step CI fixer. */
const OFFICIAL_ENTRIES: CatalogEntry[] = [
  {
    repoKey: 'official',
    meta: {
      slug: 'ci-fixer',
      name: 'CI fixer',
      description:
        'When CI fails on your repository, it reads the failure logs, makes the smallest fix that addresses the cause, re-runs the failed checks, and opens a pull request.',
      version: 1,
      recommendedTrigger: 'fires on github:ci-failed',
      delivery: 'pr',
      costBand: 'high',
      modelTier: 'MED',
      connectors: ['GitHub (gh login)'],
      limitations: 'Needs the gh CLI signed in and a repository with CI on GitHub.',
    },
    definition: definition([
      'Check whether an open PR already covers this CI failure',
      'Read CI logs and identify the failure cause',
      'Make the smallest targeted fix',
      'Rerun the failed checks',
      'Commit, push, and open a pull request',
      'Record duplicate-work skip result',
      'Finalise the run',
    ]),
    exampleOutput: 'Fixed the failing `pnpm test` step in .github/workflows/ci.yml.',
  },
];

const ADDED_ENTRIES: CatalogEntry[] = [
  {
    repoKey: ADDED_REPO,
    meta: {
      slug: 'community-digest',
      name: 'Community digest',
      description:
        'Every Monday, gathers the past week of sero-labs/sero activity — merged PRs, issues, discussions, releases — plus any Discord highlights you pasted into the community inbox, and drafts an honest weekly update.',
      version: 1,
      recommendedTrigger: 'Mondays at 9am',
      delivery: 'workspace-files',
      costBand: 'low',
      modelTier: 'MED',
      connectors: ['GitHub (gh login)'],
      limitations:
        'GitHub-only sources: Sero has no Discord-reading integration, so Discord highlights come from a manual paste-in file.',
    },
    definition: definition([
      "Collect the past week's GitHub activity",
      'Read manual Discord highlights from the community inbox',
      'Write the weekly community update draft',
      'Verify the draft and finalize the run',
    ]),
  },
  {
    // A step-only entry: its Details must still appear, because the steps are
    // the detail (task 6.3).
    repoKey: ADDED_REPO,
    meta: {
      slug: 'daily-note',
      name: 'Daily note',
      description:
        'Every weekday morning, writes a short note into your project: what changed yesterday, what looks unfinished, and one suggested focus for today.',
      version: 1,
      recommendedTrigger: 'weekdays at 8am',
      delivery: 'workspace-files',
      costBand: 'low',
      modelTier: 'LOW',
    },
    definition: definition(['Gather context and write today’s note', 'Verify note and emit completion']),
  },
];

const LIBRARY_INDEX: LibraryIndex = { version: 1, entries: [] };

const REPOS = [
  { key: 'official', url: 'official', official: true },
  { key: ADDED_REPO, url: 'file:///tmp/marketing-catalog', official: false },
];

/** Frame 4: the Catalog tab, with an official repo and one the user added. */
export function CatalogPreview() {
  const dispatch = async (params: Record<string, unknown>) => {
    if (params.action === 'catalog_list' || params.action === 'catalog_refresh') {
      return {
        ok: true,
        catalogRepos: REPOS,
        catalogContents: [
          { repo: REPOS[0], index: { version: 1, name: 'Official', entries: [] }, entries: OFFICIAL_ENTRIES, problems: [] },
          { repo: REPOS[1], index: { version: 1, name: 'marketing', entries: [] }, entries: ADDED_ENTRIES, problems: [] },
        ],
      };
    }
    return { ok: true };
  };
  return (
    <CatalogBrowser
      busy={false}
      libraryIndex={LIBRARY_INDEX}
      dispatch={dispatch}
      onOpenLoop={() => undefined}
      onShowInLibrary={() => undefined}
    />
  );
}
