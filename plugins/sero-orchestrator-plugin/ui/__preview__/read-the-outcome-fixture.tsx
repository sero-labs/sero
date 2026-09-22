/**
 * The three surfaces this change is judged on, at 1440, so each can be put
 * beside `3-read-the-outcome.html` frame by frame.
 *
 * Every value is a fixture taken from the record named in the drawing or the
 * issue: the DungeonExplorer M3 Workflow for frame 1, the Frogger Room for
 * frame 3, and Morgan for frame 4. Nothing is live.
 *
 * Each preview renders the REAL component. A preview that re-draws a surface
 * proves nothing about the surface.
 */

import { AppContext, type AppContextValue } from '@sero-ai/app-runtime';
import type { Loop, LoopRunSummary, LoopSummary } from '../../shared/types';
import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import { previewLoop } from './fixture';
import { LoopResult } from '../components/LoopResult';
import { LoopSettingsLine } from '../components/LoopSettingsLine';
import { LoopStateLine } from '../components/LoopStateLine';
import { MemberTabPanel } from '../components/RoomMemberFacts';
import { PlanPresentation } from '../components/PlanPresentation';
import { RoomCompletion } from '../components/RoomCompletion';

/**
 * The plan and the Room result read through the host bridge, which throws
 * outside the Sero shell rather than reporting nothing. The harness has no
 * shell, so it gets one that serves the fixture artifact's content and is
 * otherwise inert. `getSeroApi` recognises a bridge by these keys and never
 * replaces a real one.
 */
const PLAN_MARKDOWN = [
  '# Frogger: Neon Crossing — product and implementation direction',
  '',
  '## Decision',
  'Build **Signal Wake Crossing**: a one-screen, deterministic Frogger crossing where every hop and imminent lane movement uses the same neon wake language.',
  '',
  '## Observed workspace facts',
  'The workspace root exposes only `.git/`, `.sero/`, and `.sero-workspace.json`.',
  '',
  '## Recommended game',
  '',
  '## Presentation, sound, and access',
  '',
  '## Conditional typed Canvas architecture (new recommendation, not observed code)',
  '',
  '## Verification gates',
  '',
  '## Buildable milestone slices',
  '',
  '## Rejected alternatives',
  '',
  '## Risks and mitigations',
  '',
  '## Assumptions and unresolved user decisions',
].join('\n');

const bridge = globalThis as {
  sero?: { appState?: unknown; appAgent?: { invokeTool?: unknown } };
};
// This assigns ONTO whatever bridge is already there rather than `??=` the whole
// object: another fixture in this harness may create the bridge first, and `??=`
// would then leave `invokeTool` missing — which is exactly the "App tool bridge
// unavailable" the first capture of this preview showed.
bridge.sero ??= { appState: {}, appAgent: {} };
bridge.sero.appAgent ??= {};
bridge.sero.appAgent.invokeTool ??= async () => ({
  text: '', content: [], isError: false,
  details: { ok: true, content: PLAN_MARKDOWN },
});

// SAFETY: AppContextValue carries optional host fields a preview never needs;
// the app id, workspace and preferences are the whole contract the hooks read.
const APP_CONTEXT = {
  appId: 'orchestrator',
  workspaceId: 'ws-1',
  workspacePath: '/Users/danielcarter/Documents/Dev/projects/dungeonexplorer',
  stateFilePath: '/Users/danielcarter/Documents/Dev/projects/dungeonexplorer/.sero/apps/orchestrator/index.json',
  profilePreferences: { values: {}, set: () => undefined },
} as unknown as AppContextValue;

const days = (count: number): string => new Date(Date.now() - count * 86_400_000).toISOString();

/** Frame 1: the DungeonExplorer M3 maintenance Workflow, complete. */
// SAFETY: a partial Loop fixture. Loop has dozens of fields the page never
// reads; every field the header, the Result row and the plan do read is set.
const WORKFLOW: Loop = {
  ...previewLoop,
  id: 'loops/m3-maintenance',
  title: 'M3: Maintenance — visibility radius 3 with regression check',
  status: 'complete',
  summary: 'Reduce DungeonExplorer line-of-sight visibility radius from 5 to 3.',
  limits: { ...previewLoop.limits, maxAttemptsTotal: 50, maxWallClockMs: 30 * 60_000, maxConcurrentSteps: 1, maxCostUsd: 6 },
  planningUsage: { costUsd: 0.42 },
  runtime: {
    ...previewLoop.runtime,
    completion: {
      status: 'complete',
      reason: 'FOV_RADIUS and the matching FOV default are 3; only radius-specific existing test assertions changed; npm test passed; and evidence/m3 contains only radius3-seed42.png and a one-paragraph NOTE.md.',
    },
  },
} as unknown as Loop;

const RUNS: LoopRunSummary[] = [{ usage: { costUsd: 0.91 } } as LoopRunSummary];

// SAFETY: LoopSummary carries board-only fields the state line does not read.
const SUMMARY: LoopSummary = {
  id: WORKFLOW.id,
  title: WORKFLOW.title,
  status: 'complete',
  progress: { total: 4, done: 4, running: false },
  lastRunAt: days(10),
} as unknown as LoopSummary;

/**
 * Frame 1: the state line, the Result row, the settings, then the objective
 * with the request that started it folded under it.
 */
export function LoopEndingPreview() {
  return (
    <AppContext.Provider value={APP_CONTEXT}>
      <div className="flex flex-col gap-4 p-4">
        <header className="flex flex-col gap-3">
          <LoopStateLine loop={WORKFLOW} summary={SUMMARY} runCount={RUNS.length} />
          <LoopResult loop={WORKFLOW} />
          <LoopSettingsLine loop={WORKFLOW} runs={RUNS} busy={false} onAction={() => undefined} />
        </header>
        <PlanPresentation loop={WORKFLOW} onAction={() => undefined} />
      </div>
    </AppContext.Provider>
  );
}

// SAFETY: a RoomMember fixture. The Info tab reads configuration, status,
// usage, session and mandate; the rest of RoomMember is not consulted.
const conductor = (id: string, displayName: string, costUsd: number, turns: number): RoomMember => ({
  id,
  displayName,
  isConductor: id === 'nova',
  configuration: { model: 'openai-codex/gpt-5.6-sol', thinking: 'high', tools: ['read', 'grep', 'find', 'ls', 'sero-cli'], skills: [], permissions: 'read-only' },
  status: 'completed',
  statusDetail: 'Finished.',
  statusAt: days(10),
  usage: { costUsd, turns, inputTokens: 198_100, outputTokens: 17_900, cacheReadTokens: 4_800_000, retries: 0 },
  session: { sessionId: `s-${id}`, workspaceId: 'ws-1', compactionCount: 0, lastOpenedAt: days(10) },
  mandate: { role: 'Product Conductor', responsibilities: 'Coordinate investigation, reconcile evidence, and produce the final product and technical recommendation.', currentTask: null, priorities: [], workingInstructions: 'Maintain the shared investigation brief, partition follow-up questions, review all evidence, and synthesise the final findings.' },
  worktreePath: null,
}) as unknown as RoomMember;

const ROOM_MEMBERS = [
  conductor('nova', 'Nova — Product Conductor', 0.69264, 3),
  conductor('flux', 'Flux — Canvas Engineering Analyst', 0.0187698, 2),
  conductor('pulse', 'Pulse — Game and UX Critic', 0.01701616, 2),
];

/** Frame 3: the Frogger Room, finished, with its plan and two reports. */
// SAFETY: a partial PersistedRoom. The result view reads the title, the
// runtime totals, the delivery record, the brief and the artifact list.
const ROOM = {
  memberIds: ['nova', 'flux', 'pulse'],
  definition: { id: 'room_8f83c75a', title: 'Frogger: Neon Crossing — Product and Technical Direction', creationRequestId: 'req-1' },
  runtime: {
    status: 'completed',
    startedAt: days(10),
    endedAt: days(10),
    activeMs: 5 * 60_000 + 52_000,
    usage: { costUsd: 0.83694, turns: 7 },
    stopReason: null,
    messageSequence: 0,
    timelineSequence: 0,
    appliedCommandIds: [],
    lastProgressAt: null,
  },
  delivery: { destination: 'workspace-files', deliveredAt: days(10), deliveryRef: null, originSessionId: null, params: {} },
  brief: { objective: 'Agree the product and technical direction for Frogger: Neon Crossing.', blockers: [], openQuestions: [], decisions: [], conductorNote: null },
  artifacts: [
    { id: 'artifact_f848e9d4', roomId: 'room_8f83c75a', kind: 'report', title: 'Workspace audit and conditional Canvas direction', ref: 'artifact_f848e9d4.md', producedByMemberId: 'flux', relatedWorkId: null, createdAt: days(10) },
    { id: 'artifact_354aa84f', roomId: 'room_8f83c75a', kind: 'report', title: 'Pulse proposal: Signal Wake Crossing', ref: 'artifact_354aa84f.md', producedByMemberId: 'pulse', relatedWorkId: null, createdAt: days(10) },
    { id: 'artifact_7aafbcee', roomId: 'room_8f83c75a', kind: 'plan', title: 'Final proposal: Signal Wake Crossing', ref: 'artifact_7aafbcee.md', producedByMemberId: 'nova', relatedWorkId: null, createdAt: days(10) },
  ],
} as unknown as PersistedRoom;

const FINAL_LINE = 'Delivered and independently reviewed the Signal Wake Crossing product/technical direction. It documents the empty mounted-workspace blocker with concrete path evidence; recommends one scope-safe mechanic unifying gameplay, AV, controls, accessibility, and typed Canvas design; defines loop/system boundaries, verification gates, risks, rejected alternatives, unresolved decisions, and M0–M5 implementation slices. No code was implemented. Final plan: artifact_7aafbcee';

/** Frame 3: the Room's result, then the plan it produced, then its cost. */
export function RoomResultPreview() {
  const members = new Map(ROOM_MEMBERS.map((member) => [member.id, member]));
  return (
    <AppContext.Provider value={APP_CONTEXT}>
      <div className="flex flex-col p-4">
        <RoomCompletion room={ROOM} members={members} finalLine={FINAL_LINE} onOpenMember={() => undefined} />
      </div>
    </AppContext.Provider>
  );
}

/** Frame 4: the member's Info tab, at the width the member panel is given. */
export function MemberInfoPreview() {
  // SAFETY: as `conductor` above — the Info tab reads only the fields set here.
const morgan = {
    ...ROOM_MEMBERS[0],
    displayName: 'Morgan — Discovery Lead',
    isConductor: true,
    worktreePath: null,
    configuration: { model: 'openai-codex/gpt-5.6-sol', thinking: 'high', tools: ['read', 'grep', 'find', 'ls', 'automation_browser', 'sero-cli'], skills: [], permissions: 'read-only' },
    mandate: {
      role: 'Conductor and technical synthesiser',
      responsibilities: 'Coordinate investigation, reconcile evidence, and produce the final product and technical recommendation.',
      currentTask: null,
      priorities: [],
      workingInstructions: 'Maintain the shared investigation brief, partition follow-up questions, review all evidence, and synthesise the final findings with proposed architecture, lifecycle model, acceptance criteria, verification commands, milestones, risks, and genuine user decisions. Inspect selected files or contract details only to validate disputed or incomplete claims. Do not implement features, modify product files, or duplicate the investigators\' broad discovery passes. Ask the relevant investigator for clarification when evidence is missing, resolve overlap explicitly, and decide when the objective and success criteria are satisfied.',
    },
    usage: { ...ROOM_MEMBERS[0].usage, costUsd: 3.92, turns: 1, inputTokens: 198_100, outputTokens: 17_900, cacheReadTokens: 4_800_000, retries: 0 },
    session: { sessionId: 's-morgan', workspaceId: 'ws-1', compactionCount: 0, lastOpenedAt: days(10) },
  } as unknown as RoomMember;

  return (
    <AppContext.Provider value={APP_CONTEXT}>
      <div className="flex flex-col">
        <MemberTabPanel tab="info" member={morgan} live={null} context={null} maxCostUsd={2.5} />
      </div>
    </AppContext.Provider>
  );
}
