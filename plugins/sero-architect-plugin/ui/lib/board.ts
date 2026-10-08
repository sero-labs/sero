// The project board: which tiles exist for a record, and what each one says.
//
// The page draws only what this returns. A tile with nothing in it is absent
// here, so no component has to decide whether to show an empty box.

import { feedbackActivity, type WorkFeedback } from '@sero-ai/common';

import { milestoneCounts, type ProjectActivity } from '../../shared/activity';
import { assumptionOf } from '../../shared/agreement';
import { MAINTENANCE_MILESTONE_ID } from '../../shared/maintenance';
import type { Milestone, ProjectRecord } from '../../shared/record';
import { usd } from './format';
import { evidenceLines, needsYouItems } from './view-model';
import { workGroups, type WorkGroup } from './work-groups';

/** The large tiles, in the order the page stacks them. */
export type MainTile = 'ask' | 'stopped' | 'live' | 'result';

export type BoardTone = 'working' | 'waiting' | 'stopped' | 'done' | 'quiet';

export interface BoardStep {
  id: string;
  title: string;
  state: 'done' | 'doing' | 'todo';
  note: string;
  /** Checks were saved for this step, so its evidence can be opened. */
  checked: boolean;
  /** Names the picture those checks captured, and changes when a new one is saved. Null when there is none. */
  proofKey: string | null;
}

export interface MadeRow {
  key: string;
  text: string;
  why: string | null;
  by: 'you' | 'architect';
}

export interface Board {
  /** The Architect's newest saved sentence, or the user's request before there is one. */
  sentence: string;
  tone: BoardTone;
  /** The state, in bold, then what goes with it. */
  word: string;
  detail: string;
  progress: { done: number; total: number } | null;
  main: MainTile[];
  steps: BoardStep[];
  /** What the Architect takes the work to be, shown while no step exists yet. */
  planNote: string | null;
  /** Research was started or saved, so the Research view has something in it. */
  researched: boolean;
  made: MadeRow[];
}

export interface LiveRow {
  entry: WorkFeedback;
  group: WorkGroup;
}

/** Work this session can see running now, with the Room or Workflow it runs in. */
export function liveRows(record: ProjectRecord, work: readonly WorkFeedback[], epoch: string | null, runtimeRunning: boolean): LiveRow[] {
  if (!runtimeRunning || epoch === null) return [];
  return workGroups(record, work, epoch).flatMap((group) => group.rows
    .filter((entry) => feedbackActivity(entry, epoch) === 'working')
    .map((entry) => ({ entry, group })));
}

const TOOL_PHRASES: Record<string, string> = {
  read: 'Reading a file',
  edit: 'Editing a file',
  write: 'Writing a file',
  bash: 'Running a command',
  grep: 'Searching the code',
  find: 'Searching the code',
  ls: 'Looking at the files',
  codemode: 'Running a script',
  'sero-cli': 'Running a Sero command',
  automation_browser: 'Using the browser',
  web_search: 'Searching the web',
};

/** A tool's name in plain words. A tool this table does not know keeps its own name. */
export function toolPhrase(toolName: string | null | undefined): string {
  if (!toolName) return 'Thinking';
  // Some producers send the call with its arguments. The first word is the tool.
  return TOOL_PHRASES[toolName] ?? TOOL_PHRASES[toolName.split(' ')[0] ?? ''] ?? toolName;
}

/** What a row is doing, from what its producer reported. */
export function rowAction(entry: WorkFeedback): string {
  return entry.wait?.kind === 'tool' ? toolPhrase(entry.wait.toolName) : toolPhrase(null);
}

/** The end of a long text, started at a word, so the newest words are the ones shown. */
export function textTail(text: string, limit = 420): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(-limit);
  const space = cut.indexOf(' ');
  return `… ${space >= 0 ? cut.slice(space + 1) : cut}`;
}

function sentenceOf(record: ProjectRecord): string {
  const overview = record.overview;
  const newest = [overview?.result, overview?.acknowledgement, overview?.objective, overview?.outcome]
    .filter((item) => item !== undefined)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return newest?.text ?? record.idea;
}

const TONES: Partial<Record<ProjectActivity['state'], BoardTone>> = {
  working: 'working',
  queued: 'working',
  'waiting-for-you': 'waiting',
  stopped: 'stopped',
  complete: 'done',
};

function stepOf(milestone: Milestone): BoardStep {
  const accepted = milestone.verification === 'accepted' || milestone.verification === 'delivered';
  const state = milestone.status === 'done' || accepted ? 'done' : milestone.status === 'running' || milestone.status === 'verifying' ? 'doing' : 'todo';
  const passed = milestone.evidence ? evidenceLines(milestone.evidence).filter((check) => check.state === 'ok').length : 0;
  let note = '';
  if (state === 'done') note = passed > 0 ? `${passed} ${passed === 1 ? 'check passes' : 'checks pass'}.` : 'Done.';
  else if (milestone.status === 'verifying') note = 'Being checked.';
  else if (state === 'doing') note = 'In progress.';
  else if (milestone.status === 'parked') note = milestone.parkedBy ? 'Waits for your answer.' : 'Set aside.';
  return { id: milestone.id, title: milestone.title, state, note, checked: milestone.evidence !== null, proofKey: milestone.evidence?.preview?.capturePath ? milestone.evidence.checkedAt : null };
}

function madeRows(record: ProjectRecord): MadeRow[] {
  const answered = record.decisions
    .filter((decision) => decision.answer !== null)
    .sort((a, b) => (b.answer?.answeredAt ?? '').localeCompare(a.answer?.answeredAt ?? ''))
    .map((decision): MadeRow => ({
      key: `decision:${decision.id}`,
      text: decision.options.find((option) => option.id === decision.answer?.optionId)?.label ?? decision.answer?.optionId ?? '',
      why: decision.question,
      by: 'you',
    }));
  const assumed = (record.working?.assumptions ?? []).map(assumptionOf).map((assumption, index): MadeRow => ({
    key: `assumption:${index}`,
    text: assumption.text,
    why: assumption.why ?? null,
    by: 'architect',
  }));
  const cap = record.budget.capUsd ?? record.agreement?.capUsd ?? null;
  const limit: MadeRow[] = cap === null ? [] : [{ key: 'cap', text: `Spend up to ${usd(cap)}`, why: 'Work stops and asks you at the cap.', by: 'you' }];
  return [...answered, ...assumed, ...limit];
}

/** A sentence ends with a full stop. One that already ends is left as it is. */
const stop = (text: string): string => (/[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/**
 * The board for a record.
 *
 * `activity` is the derived state the rest of the app uses, so the board never
 * disagrees with the projects list. `live` says whether this session sees work
 * running, `action` is what that work is doing in plain words, and `waitingFor`
 * names an open wait the Architect registered. `beneath` is the state without
 * the open questions, so a stop is not lost behind one.
 */
export function boardOf(record: ProjectRecord, activity: ProjectActivity, context: { live: boolean; action?: string; waitingFor?: string; beneath?: ProjectActivity }): Board {
  const asks = needsYouItems(record).length > 0;
  const started = activity.action !== 'Review access';
  // A stop holds the control that fixes it. A question is answered on its own tile,
  // and a stop that the question would hide is still shown under it.
  const under = context.beneath ?? activity;
  const stopped = under.state === 'stopped' || !started || (under.state === 'waiting-for-you' && !asks);
  const main: MainTile[] = [];
  if (asks) main.push('ask');
  if (stopped) main.push('stopped');
  if (context.live) main.push('live');
  if (activity.state === 'complete' && main.length === 0) main.push('result');

  let word = stop(activity.headline);
  let detail = stop(activity.owner);
  if (asks) {
    word = 'Waiting for you.';
    detail = context.live ? 'Other work continues.' : 'Nothing is running.';
  } else if (stopped) {
    // The stop tile states the cause and holds its fix, so the cause is not said twice.
    word = !started ? 'Not started.' : activity.state === 'waiting-for-you' ? 'Waiting for you.' : 'Stopped.';
    detail = context.live ? 'Other work continues.' : 'Nothing is running.';
  } else if (activity.state !== 'paused' && (context.live || activity.state === 'working')) {
    // A paused project keeps its own line: it says the turns in flight are finishing.
    word = 'Working.';
    detail = stop(context.action ?? activity.owner);
  } else if (activity.state === 'idle' && context.waitingFor) {
    // The Architect registered a wait. That is why nothing runs, so the line says so.
    word = 'Waiting.';
    detail = stop(`For ${context.waitingFor}`);
  }

  const counts = milestoneCounts(record);
  return {
    sentence: sentenceOf(record),
    tone: asks ? 'waiting' : context.live && activity.state !== 'paused' ? 'working' : TONES[activity.state] ?? 'quiet',
    word,
    detail,
    progress: counts.total > 0 ? { done: counts.accepted, total: counts.total } : null,
    main,
    steps: started ? record.milestones.filter((milestone) => milestone.id !== MAINTENANCE_MILESTONE_ID).map(stepOf) : [],
    planNote: started ? record.working?.objective ?? (record.brief ? 'A plan is written.' : null) : null,
    researched: started && (record.research.length > 0 || (record.pendingResearch ?? []).length > 0),
    made: started ? madeRows(record) : [],
  };
}

/** How long the project has run, in the largest unit that reads well. */
export function elapsedLabel(fromIso: string, toMs: number): string {
  const minutes = Math.max(0, Math.floor((toMs - Date.parse(fromIso)) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}
