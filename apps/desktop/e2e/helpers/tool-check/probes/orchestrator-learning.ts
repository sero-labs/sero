/**
 * What the Orchestrator learns from a loop's runs: reflection and the
 * suggestions it queues, and a reusable skill drafted from a proven loop.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expectError, expectOk, expectText } from '../expect';
import { pageOf } from '../files';
import type { ScenarioStep, StepContext } from '../types';
import { must } from './cron-memory-support';
import { SKILL_BODY, SKILL_DESCRIPTION, SKILL_NAME, SUGGEST_APPROVE, SUGGEST_REJECT, SUGGESTED_INSTRUCTIONS } from './orchestrator-plans';
import {
  loopDir,
  loopIdOf,
  MANUAL,
  readLoop,
  readRevisions,
  RECOVERY,
  RECURRING,
} from './orchestrator-support';

const manualId = (ctx: StepContext): string => loopIdOf(ctx, 'manual');

function suggestionId(ctx: StepContext, which: 'approve' | 'reject'): string {
  const id = ctx.state[`orchestrator:suggestion:${which}`];
  must(typeof id === 'string', `no ${which} suggestion id was saved`);
  return id;
}

export const reflectionSteps: ScenarioStep[] = [
  {
    action: 'reflect',
    params: (ctx) => ({ action: 'reflect', loopId: manualId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, `Reflected loop ${manualId(ctx)} — 2 suggestion(s) for review.`);
      const loop = await readLoop(ctx, manualId(ctx));
      must(loop.insights?.some((insight) => insight.summary === `${MANUAL} insight 1`), `the insight was not saved: ${JSON.stringify(loop.insights)}`);
      const approve = loop.suggestions?.find((suggestion) => suggestion.rationale === SUGGEST_APPROVE);
      const reject = loop.suggestions?.find((suggestion) => suggestion.rationale === SUGGEST_REJECT);
      must(approve?.status === 'pending' && reject?.status === 'pending', `the suggestions are ${JSON.stringify(loop.suggestions)}`);
      ctx.state['orchestrator:suggestion:approve'] = approve.id;
      ctx.state['orchestrator:suggestion:reject'] = reject.id;
    },
  },
  {
    // Approving applies the suggested plan as a new revision of the loop.
    action: 'choose_suggestion',
    setup: async (ctx) => {
      ctx.state['orchestrator:revisionBefore'] = (await readLoop(ctx, manualId(ctx))).plan.revision;
    },
    params: (ctx) => ({ action: 'choose_suggestion', loopId: manualId(ctx), suggestionId: suggestionId(ctx, 'approve'), decision: 'approve' }),
    async expect(result, ctx) {
      expectText(result, 'Suggestion approved and applied.');
      const loop = await readLoop(ctx, manualId(ctx));
      must(loop.suggestions?.find((s) => s.id === suggestionId(ctx, 'approve'))?.status === 'approved', 'the suggestion is not marked approved');
      must(loop.plan.steps[0]!.instructions === SUGGESTED_INSTRUCTIONS, `the plan was not changed: ${loop.plan.steps[0]!.instructions}`);
      must(loop.plan.revision === Number(ctx.state['orchestrator:revisionBefore']) + 1, `the plan revision is ${loop.plan.revision}`);
      const revisions = await readRevisions(ctx, manualId(ctx));
      must(revisions.some((revision) => revision.status === 'applied' && revision.reason.startsWith('reflection:')), `no applied revision: ${JSON.stringify(revisions)}`);
    },
  },
  {
    action: 'choose_suggestion',
    params: (ctx) => ({
      action: 'choose_suggestion',
      loopId: manualId(ctx),
      suggestionId: suggestionId(ctx, 'reject'),
      decision: 'reject',
      rejectionReason: 'tc-orch: one step is enough',
    }),
    async expect(result, ctx) {
      expectText(result, 'Suggestion rejected.');
      const loop = await readLoop(ctx, manualId(ctx));
      const rejected = loop.suggestions?.find((s) => s.id === suggestionId(ctx, 'reject'));
      must(rejected?.status === 'rejected' && rejected.rejectionReason === 'tc-orch: one step is enough', `the suggestion is ${JSON.stringify(rejected)}`);
      must(loop.plan.steps.length === 1, 'a rejected suggestion changed the plan');
    },
  },
];

/** Reflects every loop that has run. Run it after the recurring and recovery loops have. */
export const reflectWorkspaceStep: ScenarioStep = {
  action: 'reflect_workspace',
  params: { action: 'reflect_workspace' },
  timeoutMs: 180_000,
  async expect(result, ctx) {
    expectOk(result);
    const reflected = /Reflected (\d+) loop\(s\)/.exec(result.text)?.[1];
    must(reflected !== undefined && Number(reflected) >= 3, `workspace reflection said: ${result.text}`);
    // Each loop learns only from its own history, so each one has its own insight.
    for (const [key, token, n] of [['manual', MANUAL, 2], ['recurring', RECURRING, 1], ['recovery', RECOVERY, 1]] as const) {
      const loop = await readLoop(ctx, loopIdOf(ctx, key));
      must(loop.insights?.some((insight) => insight.summary === `${token} insight ${n}`), `${key}: no "${token} insight ${n}" in ${JSON.stringify(loop.insights)}`);
    }
  },
};

// ── Skills ───────────────────────────────────────────────────────────────────

const EDITED_BODY = `${SKILL_BODY}\n\nChecked by the probe.`;

function skillWrite() {
  return { name: SKILL_NAME, description: SKILL_DESCRIPTION, body: EDITED_BODY };
}

/** The write's content hash, as the host builds it (`features/skills/write-approvals.ts`). */
function contentHash(write: { name: string; description: string; body: string }): string {
  return createHash('sha256').update(JSON.stringify([write.name, write.description, write.body, false])).digest('hex');
}

function skillParams(ctx: StepContext) {
  const draft = ctx.state['orchestrator:skillDraft'];
  must(typeof draft === 'string', 'no skill draft id was saved');
  const write = skillWrite();
  return { action: 'save_skill', loopId: manualId(ctx), skillDraftId: draft, skillName: write.name, skillDescription: write.description, skillBody: write.body };
}

async function expectDraft(ctx: StepContext, status: string): Promise<string> {
  const loop = await readLoop(ctx, manualId(ctx));
  must(loop.skillDraft?.status === status, `the skill draft is ${JSON.stringify(loop.skillDraft)}, expected ${status}`);
  return loop.skillDraft.id;
}

export const skillSteps: ScenarioStep[] = [
  {
    action: 'extract_skill',
    params: (ctx) => ({ action: 'extract_skill', loopId: manualId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, `Drafted skill "${SKILL_NAME}" for review`);
      ctx.state['orchestrator:skillDraft'] = await expectDraft(ctx, 'pending');
      const body = JSON.parse(await fs.readFile(path.join(loopDir(ctx, manualId(ctx)), 'artifacts', 'skill-draft.json'), 'utf8')) as { body?: string };
      must(body.body === SKILL_BODY, `the draft body is ${JSON.stringify(body.body)}`);
    },
  },
  {
    // A call the model makes on its own: no person approved this write in the app, so the host refuses it.
    action: 'save_skill',
    params: skillParams,
    async expect(result, ctx) {
      expectError(result, 'not approved in the app');
      await expectDraft(ctx, 'pending');
      must(!(await readLoop(ctx, manualId(ctx))).skillLink, 'a refused save still linked a skill');
    },
  },
  {
    // The person approves exactly these bytes in the app window, over the channel a model does not have.
    action: 'save_skill',
    setup: async (ctx) => {
      const scope = `${manualId(ctx)}:${String(ctx.state['orchestrator:skillDraft'])}`;
      await pageOf(ctx).evaluate(({ scope: s, hash }) => window.sero.skills.approveSkillWrite(s, hash), { scope, hash: contentHash(skillWrite()) });
    },
    params: skillParams,
    async expect(result, ctx) {
      expectText(result, `Saved skill "${SKILL_NAME}" to `);
      await expectDraft(ctx, 'saved');
      const link = (await readLoop(ctx, manualId(ctx))).skillLink;
      must(link?.name === SKILL_NAME, `the skill link is ${JSON.stringify(link)}`);
      const file = await fs.readFile(link.filePath, 'utf8');
      must(file.includes(EDITED_BODY) && file.includes(`name: ${SKILL_NAME}`), `the skill file is wrong:\n${file}`);
      must(file.includes(`sero-workflow:${manualId(ctx)}`), 'the skill file does not say which Workflow it came from');
    },
  },
  {
    // A second pass replaces the saved draft with a fresh pending one.
    action: 'extract_skill',
    params: (ctx) => ({ action: 'extract_skill', loopId: manualId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, `Drafted skill "${SKILL_NAME}" for review`);
      const fresh = await expectDraft(ctx, 'pending');
      must(fresh !== ctx.state['orchestrator:skillDraft'], 'the second extraction reused the saved draft');
      ctx.state['orchestrator:skillDraft'] = fresh;
    },
  },
  {
    action: 'discard_skill_draft',
    params: (ctx) => ({ action: 'discard_skill_draft', loopId: manualId(ctx) }),
    async expect(result, ctx) {
      expectText(result, 'Discarded the skill draft');
      await expectDraft(ctx, 'discarded');
      const link = (await readLoop(ctx, manualId(ctx))).skillLink;
      must(link && (await fs.readFile(link.filePath, 'utf8')).includes(EDITED_BODY), 'discarding the draft touched the saved skill');
    },
  },
];
