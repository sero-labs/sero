/**
 * Coordinator-facing handlers for skill extraction (specs/18-skill-extraction.md).
 * Kept out of coordinator.ts (500-LOC limit), as reflect-actions.ts is.
 *
 *   extract_skill        — draft a reusable SKILL.md from a proven Workflow
 *   save_skill           — write the user's reviewed draft through the host
 *   discard_skill_draft  — drop the draft, writing nothing
 *
 * Only `save_skill` touches the filesystem, and it does so through the gated
 * host capability. The plugin never writes a skill file itself.
 */

import type { Loop, OrchestratorAction, OrchestratorActionResult } from '../shared/types';
import type { OrchestratorHost } from './host';
import { gatherHistory } from './digest';
import { hasCompletedRun, proposeSkill, readDraftBody, writeDraftBody, VALID_SKILL_NAME } from './skill-extract';

type SkillAction = Extract<
  OrchestratorAction,
  { kind: 'extract_skill' | 'save_skill' | 'discard_skill_draft' }
>;

async function findLoop(host: OrchestratorHost, loopId: string): Promise<Loop | undefined> {
  const state = await host.readState();
  return state?.loops.find((l) => l.id === loopId);
}

async function replaceLoop(host: OrchestratorHost, loop: Loop): Promise<void> {
  await host.updateState((state) => ({ ...state, loops: state.loops.map((l) => (l.id === loop.id ? loop : l)) }));
}

async function extractSkill(host: OrchestratorHost, loopId: string): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };

  const history = await gatherHistory(host, loop);
  if (!hasCompletedRun(history)) {
    return { ok: false, error: 'No successful run yet — a skill is extracted from what worked.' };
  }

  const output = await proposeSkill(host, loop, history);
  if ('declined' in output) {
    // A refusal is a successful pass. Nothing is stored, so a later run of the
    // same workflow can still produce a draft once there is more to learn from.
    return { ok: true, loop, skillDeclined: output.declined };
  }

  const updated: Loop = { ...loop, skillDraft: output.draft, updatedAt: host.now() };
  await replaceLoop(host, updated);
  return { ok: true, loop: updated, skillDraftBody: await readDraftBody(host, output.draft.bodyRef) };
}

async function saveSkill(
  host: OrchestratorHost,
  action: Extract<SkillAction, { kind: 'save_skill' }>,
): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };
  if (!loop.skillDraft) return { ok: false, error: 'No skill draft to save — extract one first.' };
  if (!host.skills) {
    return { ok: false, error: 'This Sero build cannot save skills from the Orchestrator.' };
  }

  const name = action.name.trim();
  const description = action.description.trim();
  const body = action.body;
  if (!VALID_SKILL_NAME.test(name)) {
    return { ok: false, error: `Invalid skill name '${name}'. Use lowercase letters, numbers and hyphens.` };
  }
  if (!description) return { ok: false, error: 'A skill needs a description — it is its trigger text.' };
  if (!body.trim()) return { ok: false, error: 'A skill needs a body.' };

  // The user's edits are what gets written; the draft is only where they started.
  const existing = (await host.skills.list()).find((skill) => skill.name === name);
  if (existing && !action.overwrite) {
    return { ok: false, error: `A skill named '${name}' already exists.`, skillConflict: { name, filePath: existing.filePath } };
  }

  const written = await host.skills.write({
    name,
    description,
    body,
    origin: `sero-workflow:${loop.id}`,
    overwrite: action.overwrite,
  });

  const now = host.now();
  // Keep the edited body: the draft artifact is what the review dialog reopens.
  const bodyRef = await writeDraftBody(host, loop.id, body);
  const updated: Loop = {
    ...loop,
    skillDraft: { ...loop.skillDraft, name, description, bodyRef, status: 'saved', decidedAt: now },
    skillLink: { name, filePath: written.filePath, savedAt: now },
    updatedAt: now,
  };
  await replaceLoop(host, updated);
  host.log(`Saved skill '${name}' from loop ${loop.id} (${written.created ? 'created' : 'replaced'})`);
  return { ok: true, loop: updated };
}

async function discardDraft(host: OrchestratorHost, loopId: string): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
  if (!loop.skillDraft) return { ok: false, error: 'No skill draft to discard.' };

  const now = host.now();
  const updated: Loop = {
    ...loop,
    skillDraft: { ...loop.skillDraft, status: 'discarded', decidedAt: now },
    updatedAt: now,
  };
  await replaceLoop(host, updated);
  return { ok: true, loop: updated };
}

export function handleSkillAction(host: OrchestratorHost, action: SkillAction): Promise<OrchestratorActionResult> {
  switch (action.kind) {
    case 'extract_skill':
      return extractSkill(host, action.loopId);
    case 'save_skill':
      return saveSkill(host, action);
    case 'discard_skill_draft':
      return discardDraft(host, action.loopId);
  }
}
