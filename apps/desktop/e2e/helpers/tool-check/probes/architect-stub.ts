/**
 * The stub model's side of the Architect story: the sessions a project starts
 * besides its owner. A researcher, a Workflow's planner and step, a Room's
 * planner and member, and the maintenance Workflow. Each is told apart by a
 * marker in its system prompt and by a word the story put in its task.
 */
import { STUB_MODEL_ID, STUB_PROVIDER_ID, type StubReply, type StubRequest } from '../../stub-model';
import { identityText, runTurn, userMessages } from './session-script';

export const RESEARCH_QUESTION = 'tc-research-question: which page layout fits a notes page';
export const RESEARCH_FINDING = 'tc-research-finding: a single column layout fits';
export const WORKFLOW_MARK = 'tc-dispatch-workflow';
export const ROOM_MARK = 'tc-dispatch-room';
export const WORKFLOW_FILE = 'notes.html';
export const OWN_WORK_FILE = 'notes-own.html';

const MODEL = `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`;

// Markers in the Orchestrator's system prompts (plugins/sero-orchestrator-plugin/runtime).
const PLANNER = 'You are the PLANNER for Sero Orchestrator';
const STEP = 'You are executing ONE step of a Sero Orchestrator loop';
const ROOM_PLANNER = 'You are the ROOM PLANNER';
const RESEARCHER = 'Research the supplied project question';

/** The maintenance Workflow the project creates on entering maintenance. */
const MAINTENANCE_MARK = 'Maintenance triage for the project';

const firstText = (request: StubRequest): string => userMessages(request)[0]?.text ?? '';

function planningReply(title: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    title,
    summary: 'One step does the work.',
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: title,
      steps: [{
        id: 'tc-step',
        title,
        instructions: 'Do the work the task describes, then report the outcome.',
        expectedOutcome: 'The work is done.',
        execution: { type: 'background-agent', model: 'LOW' },
      }],
    },
  });
}

/** The StepOutcome a step ends on. The single step is the loop's last, so it completes the loop. */
function stepOutcome(summary: string): string {
  return `Done.\n\`\`\`json\n${JSON.stringify({ status: 'succeeded', summary, completion: { status: 'complete', reason: summary } })}\n\`\`\``;
}

function roomPlan(thinking: string): string {
  return JSON.stringify({
    title: 'Tc dispatched room',
    approach: 'One lead stands by.',
    objective: 'Hold a Room open for the Architect to control.',
    successCriteria: ['The Room can be paused, resumed and cancelled.'],
    roomInstructions: 'Stand by. Do not touch files.',
    collaborationStrategy: 'There is one member.',
    teamRationale: 'One member is enough to be controlled.',
    workspacePolicy: { mode: 'read-only-shared' },
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 0.01,
    openAssumptions: [],
    members: [{
      key: 'ar-lead',
      displayName: 'Ar Lead',
      role: 'Conductor',
      responsibility: 'Stands by.',
      mandate: 'Stand by and say so. Do not touch files.',
      reasonForInclusion: 'A Room needs a Conductor.',
      isConductor: true,
      model: MODEL,
      thinking,
      promptAdditions: [],
      tools: ['read'],
      skills: [],
      permissions: 'read-only',
      needsWorktree: false,
    }],
  });
}

/** Answers the sessions the Architect's work starts. Anything else is left to the other responders. */
export function architectWorkResponder(request: StubRequest): StubReply | undefined {
  const task = firstText(request);

  if (request.system.includes(RESEARCHER) && task.includes(RESEARCH_QUESTION)) return { text: RESEARCH_FINDING };

  if (request.system.includes(ROOM_PLANNER) && task.includes(ROOM_MARK)) {
    return { text: roomPlan(/AVAILABLE THINKING LEVELS[^\n]*\n([^\n,]+)/.exec(task)?.[1]?.trim() ?? 'off') };
  }
  if (identityText(request).includes('You are Ar Lead,')) return { text: 'Ar Lead is standing by.' };

  if (request.system.includes(PLANNER) && task.includes(WORKFLOW_MARK)) return { text: planningReply('Write the notes page') };
  if (request.system.includes(STEP) && task.includes(WORKFLOW_MARK)) {
    return runTurn(request, [{ name: 'write', arguments: { path: WORKFLOW_FILE, content: '<h1>tc-title</h1>\n' } }], stepOutcome(`wrote ${WORKFLOW_FILE}`));
  }

  if (request.system.includes(PLANNER) && task.includes(MAINTENANCE_MARK)) return { text: planningReply('Triage the project') };
  if (request.system.includes(STEP) && task.includes(MAINTENANCE_MARK)) return { text: stepOutcome('nothing to triage') };
  return undefined;
}
