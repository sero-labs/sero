import type { ArchitectHost } from './host';
import { openSpecInstructions, openSpecStatus, requireOpenSpecHost, validateOpenSpecChange } from './openspec';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { ProjectRecord } from '../shared/record';
import type { Milestone } from '../shared/record';

export async function checkLinkedChange(
  host: Partial<Pick<ArchitectHost, 'exec'>>,
  record: ProjectRecord,
  milestone: Milestone,
): Promise<OwnerActionOutcome | null> {
  if (!milestone.openSpecChange) return null;
  if (!record.research.some((result) => result.openSpecChange === milestone.openSpecChange && result.roomId)) {
    return { ok: false, text: `Explore OpenSpec change ${milestone.openSpecChange} in a read-only Room and wait for its findings before planning implementation.` };
  }
  try {
    await validateOpenSpecChange(requireOpenSpecHost(host), record.folder, milestone.openSpecChange);
    return null;
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : String(error) };
  }
}

export function linkedChangePrompt(milestone: Milestone, prompt: string): string {
  if (!milestone.openSpecChange) return prompt;
  return `${prompt}\n\nImplement the approved OpenSpec change at openspec/changes/${milestone.openSpecChange}/. Read its proposal, specs, design and tasks before editing code. Work through and check off tasks.md. Keep the implementation within the approved requirements. Report the requirement coverage and any gaps; do not claim completion from checkboxes alone. Do not archive the change during this proof of concept.`;
}

export async function executeOwnerOpenSpec(
  host: Partial<Pick<ArchitectHost, 'exec'>>,
  record: ProjectRecord,
  input: OwnerActionInput,
): Promise<OwnerActionOutcome> {
  if (!record.openSpecEnabled) return { ok: false, text: 'OpenSpec is not enabled for this project.' };
  const name = input.changeName;
  if (!name || !record.milestones.some((item) => item.openSpecChange === name)) return { ok: false, text: 'Name an OpenSpec change linked to this project.' };
  try {
    const cli = requireOpenSpecHost(host);
    if (input.operation === 'status') return { ok: true, text: (await openSpecStatus(cli, record.folder, name)).slice(0, 16000) };
    if (input.operation === 'instructions' && input.artifact) return { ok: true, text: (await openSpecInstructions(cli, record.folder, name, input.artifact)).slice(0, 24000) };
    if (input.operation === 'validate') {
      await validateOpenSpecChange(cli, record.folder, name);
      return { ok: true, text: `OpenSpec change ${name} is ready for implementation.` };
    }
    return { ok: false, text: 'Use status, validate, or instructions with an artifact.' };
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : String(error) };
  }
}
