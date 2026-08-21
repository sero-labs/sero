/**
 * Skill extraction (see specs/18-skill-extraction.md).
 *
 * `proposeSkill` reads a Workflow that has completed at least once and drafts a
 * reusable SKILL.md for the everyday agent — the method, the order, the checks,
 * and the traps the run history exposed. It writes NOTHING: the draft is
 * reviewed, editable, and saved by the user (skill-actions.ts).
 *
 * Two deliberate choices:
 *   - it runs as a READ-ONLY background agent, so it can load the profile's
 *     `skill-creator` skill and read the files the plan's instructions name. A
 *     pure model call can do neither.
 *   - it may decline. A Workflow that teaches nothing durable produces no draft
 *     and a reason — the same no-churn guarantee reflection makes when it
 *     returns no suggestions.
 */

import type { AppRuntimeSkillSummary } from '@sero-ai/common';

import type { Loop, RunDigest, SkillDraft } from '../shared/types';
import type { OrchestratorHost } from './host';
import { isRecord, runStructuredJson, type ParseResult } from './structured-call';
import { loopArtifactDir } from './artifacts';

/** Directory-name rules, mirrored from the host so an invalid name never travels. */
export const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Bound on the drafted body, so one bad reply cannot write a huge artifact. */
const MAX_BODY_CHARS = 40_000;

const EXTRACT_SYSTEM = `You are the SKILL EXTRACTOR for Sero. You read one workflow that has already run successfully and decide whether the way it works is worth teaching to an agent as a reusable skill.

FIRST: load the \`skill-creator\` skill and follow it. It is the authority on frontmatter, description quality, progressive disclosure, and body style. If it is not available, apply its rules as you know them.

You may read files in the workspace to ground the skill in real paths, commands and conventions. You must not write, move or delete anything.

Return ONLY one JSON object, in a \`\`\`json fence and nothing else:

\`\`\`json
{
  "skill": {
    "name": "lowercase-hyphenated-name",
    "description": "what the skill does AND when to use it",
    "body": "the markdown body of SKILL.md, without frontmatter",
    "rationale": "one line: what is worth teaching here, grounded in the runs"
  }
}
\`\`\`

Or, when there is nothing durable to teach:

\`\`\`json
{ "skill": null, "reason": "why this workflow teaches nothing reusable" }
\`\`\`

RULES — read carefully:
- Write for A GENERAL AGENT DOING THIS WORK BY HAND. Never mention this workflow, its steps, step ids, or the orchestrator. A reader must not be able to tell the skill came from an automated run.
- Teach only what the run history EVIDENCES: the order that worked, the checks that caught problems, the real commands and paths, and the traps that caused retries or recovery. Do not invent best practices.
- "description" is the only text always in context and is the whole triggering mechanism. State what it does and the situations that should trigger it.
- Keep the body under 500 lines. Imperative, specific, no preamble, no "when to use" section, no notes about how the skill was made.
- Reuse an existing skill's ground rather than restating it: you are given the skills that already exist.
- RETURN "skill": null WHEN THE WORKFLOW IS A ONE-OFF, IS TRIVIAL, OR ONLY REPEATS WHAT AN AGENT ALREADY KNOWS. Never invent a skill to look useful.`;

function renderPlan(loop: Loop): string {
  return loop.plan.steps
    .map((step) => {
      const target = step.execution;
      const parts = [`  - ${step.title} [${target.type}]`];
      if (target.type === 'background-agent') {
        if (target.agent) parts.push(`    agent: ${target.agent}`);
        if (target.tools?.length) parts.push(`    tools: ${target.tools.join(', ')}`);
      }
      parts.push(`    instructions: ${step.instructions}`);
      return parts.join('\n');
    })
    .join('\n');
}

function renderHistory(history: RunDigest[]): string {
  return history
    .map((digest) => {
      const trouble = digest.steps
        .filter((step) => step.attempts > 1 || step.failureSummary)
        .map((step) => `      - ${step.title}: ${step.status}, ${step.attempts} attempt(s)${step.failureSummary ? ` — ${step.failureSummary}` : ''}`)
        .join('\n');
      const recoveries = digest.recoveries.length
        ? `\n      recoveries: ${digest.recoveries.map((r) => `${r.stepId}:${r.decision} (${r.reason})`).join('; ')}`
        : '';
      return `  Run ${digest.runNumber} [${digest.status}${digest.completion ? `/${digest.completion}` : ''}]`
        + `${trouble ? `\n    what went wrong:\n${trouble}` : ''}${recoveries}`;
    })
    .join('\n');
}

function buildExtractTask(loop: Loop, history: RunDigest[], existing: AppRuntimeSkillSummary[]): string {
  const insights = loop.insights?.length
    ? loop.insights.map((insight) => `  - ${insight.summary}`).join('\n')
    : '(none)';
  const skills = existing.length
    ? existing.map((skill) => `  - ${skill.name}: ${skill.description}`).join('\n')
    : '(none)';
  return [
    `Workflow: ${loop.title}`,
    `\nWhat the user asked for:\n${loop.prompt}`,
    `\nHow it works (the proven method):\n${renderPlan(loop)}`,
    `\nWhere its results go: ${loop.delivery?.destination ?? '(default for its placement)'}`,
    `\nRun history (oldest first):\n${renderHistory(history)}`,
    `\nLessons already recorded about this workflow:\n${insights}`,
    `\nSkills that already exist in this profile:\n${skills}`,
    `\nReturn the extraction JSON now.`,
  ].join('\n');
}

function buildExtractRepair(previous: string, errors: string[]): string {
  return [
    'Your previous extraction JSON was invalid.',
    `\nYour previous reply:\n${previous}`,
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nReturn a corrected extraction JSON that fixes every problem. Output ONLY the JSON object.',
  ].join('\n');
}

interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  rationale: string;
}

/** Either a drafted skill or a reasoned refusal — both are successful outcomes. */
type ParsedExtraction = { skill: ParsedSkill } | { skill: null; reason: string };

function parseExtraction(value: unknown): ParseResult<ParsedExtraction> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Reply must be a JSON object with a "skill" key (an object, or null with a "reason").'] };
  }
  // Only an EXPLICIT null is a refusal. A missing key is a malformed reply, and
  // reading it as "nothing to teach" would hide a broken pass as a judgement.
  if (value.skill === null) {
    const reason = typeof value.reason === 'string' && value.reason.trim()
      ? value.reason.trim()
      : 'Nothing durable to teach.';
    return { ok: true, value: { skill: null, reason } };
  }
  if (!isRecord(value.skill)) {
    return { ok: false, errors: ['"skill" must be an object, or null with a "reason".'] };
  }

  const { name, description, body, rationale } = value.skill;
  const errors: string[] = [];
  if (typeof name !== 'string' || !VALID_SKILL_NAME.test(name)) {
    errors.push('"name" must be lowercase letters, numbers and hyphens only, starting with a letter or number.');
  }
  if (typeof description !== 'string' || !description.trim()) {
    errors.push('"description" is required and must say what the skill does AND when to use it.');
  }
  if (typeof body !== 'string' || !body.trim()) errors.push('"body" is required (the SKILL.md markdown, without frontmatter).');
  if (typeof body === 'string' && body.length > MAX_BODY_CHARS) {
    errors.push(`"body" is too long (${body.length} chars, limit ${MAX_BODY_CHARS}). Move detail out or cut it.`);
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      skill: {
        name: name as string,
        description: (description as string).trim(),
        body: body as string,
        rationale: typeof rationale === 'string' && rationale.trim() ? rationale.trim() : 'Extracted from this workflow’s successful runs.',
      },
    },
  };
}

export type SkillExtractOutput =
  | { draft: SkillDraft }
  | { declined: string };

/** True once the loop has a run the extractor can learn a working method from. */
export function hasCompletedRun(history: RunDigest[]): boolean {
  return history.some((digest) => digest.completion === 'complete');
}

/**
 * The draft body lives in its own colocated artifact, as JSON — the renderer
 * watches JSON files through the app-state bridge, so the review dialog can
 * reopen a pending draft after a reload without re-running the pass.
 */
export function skillDraftBodyPath(loopId: string): string {
  return `${loopArtifactDir(loopId)}/skill-draft.json`;
}

export function writeDraftBody(host: OrchestratorHost, loopId: string, body: string): Promise<string> {
  return host.writeArtifact(skillDraftBodyPath(loopId), JSON.stringify({ body }, null, 2));
}

export async function readDraftBody(host: OrchestratorHost, ref: string): Promise<string> {
  const raw = await host.readArtifact(ref);
  if (!raw) return '';
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
}

/**
 * Runs the extraction pass. The caller supplies the gathered history and is
 * responsible for the eligibility check.
 */
export async function proposeSkill(
  host: OrchestratorHost,
  loop: Loop,
  history: RunDigest[],
): Promise<SkillExtractOutput> {
  const existing = host.skills ? await host.skills.list() : [];
  const result = await runStructuredJson<ParsedExtraction>(host, {
    systemPrompt: EXTRACT_SYSTEM,
    task: buildExtractTask(loop, history, existing),
    parse: parseExtraction,
    buildRepair: buildExtractRepair,
    parentSessionId: loop.runtime.parentSessionId,
    platformTools: 'readOnly',
    cwd: loop.runtime.workspace.resolved?.cwd ?? host.workspacePath,
  });

  if (result.responses.length) {
    await host.writeArtifact(
      `${loopArtifactDir(loop.id)}/skill-extract/${host.newId('extract')}.txt`,
      result.responses.join('\n\n--- repair ---\n\n'),
    );
  }
  if (!result.ok || !result.value) {
    const reason = result.errors[0] ?? 'invalid response';
    host.log(`skill extraction failed for ${loop.id}: ${reason}`);
    return { declined: `The extraction pass returned nothing usable (${reason}).` };
  }
  if (result.value.skill === null) return { declined: result.value.reason };

  const { name, description, body, rationale } = result.value.skill;
  const bodyRef = await writeDraftBody(host, loop.id, body);
  return {
    draft: {
      id: host.newId('skill'),
      createdAt: host.now(),
      name: loop.skillLink?.name ?? name,
      description,
      bodyRef,
      fromRunNumbers: history.filter((d) => d.completion === 'complete').map((d) => d.runNumber),
      rationale,
      status: 'pending',
    },
  };
}
