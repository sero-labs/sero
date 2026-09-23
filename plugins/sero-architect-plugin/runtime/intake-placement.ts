/**
 * Where a new project works: a folder the Architect makes, or a workspace that
 * already exists. Intake resolves the choice before it writes a record, so a
 * refusal leaves no project behind and touches no folder.
 */

import os from 'node:os';
import path from 'node:path';

import { ensureUniqueId, workspaceSlug } from '@sero-ai/common';

import type { CreateProjectInput } from '../shared/create-project';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

/** The default Sero workspace. It holds personal data, so it is never a project. */
const GLOBAL_WORKSPACE_ID = 'global';

export interface IntakePlacement {
  name: string;
  folder: string;
  workspaceId: string | null;
}

export type PlacementOutcome = { ok: true; placement: IntakePlacement } | { ok: false; error: string };

export function expandHome(folder: string): string {
  return folder.startsWith('~') ? path.join(os.homedir(), folder.slice(1)) : path.resolve(folder);
}

export async function resolveIntakePlacement(
  input: CreateProjectInput,
  deps: { host: ArchitectHost; store: RecordStore },
): Promise<PlacementOutcome> {
  const folderInput = input.folder?.trim() ?? '';
  const chosenWorkspaceId = input.workspaceId?.trim() ?? '';
  if (folderInput && chosenWorkspaceId) return { ok: false, error: 'Choose a new folder or an existing workspace, not both.' };
  if (!folderInput && !chosenWorkspaceId) return { ok: false, error: 'Choose a new folder or an existing workspace.' };

  if (chosenWorkspaceId) {
    const workspace = (await deps.host.listWorkspaces()).find((candidate) => candidate.id === chosenWorkspaceId);
    if (!workspace) return { ok: false, error: `No workspace ${chosenWorkspaceId} is registered.` };
    if (workspace.id === GLOBAL_WORKSPACE_ID) return { ok: false, error: 'The Global workspace cannot hold an Architect project.' };
    // One Architect project per workspace: new work goes to the project already there.
    if ((await deps.store.list()).some((project) => project.workspaceId === workspace.id)) {
      return { ok: false, error: `${workspace.name} already has an Architect project.` };
    }
    return { ok: true, placement: { name: workspace.name, folder: workspace.path, workspaceId: workspace.id } };
  }

  const folder = expandHome(folderInput);
  const name = path.basename(folder);
  if (await deps.host.pathExists(folder)) return { ok: false, error: existingFolder(folder) };
  // The host creates the workspace at `parent/<ensureUniqueId(slug(name))>`.
  // Intake predicts that exact destination, refuses when it exists, and records
  // it as the project's folder, so a resume can find the workspace by path. The
  // ids come from the same registry the host reads.
  const registeredIds = new Set((await deps.host.listWorkspaces()).map((workspace) => workspace.id));
  const destination = path.join(path.dirname(folder), ensureUniqueId(workspaceSlug(name), registeredIds));
  if (destination !== folder && await deps.host.pathExists(destination)) return { ok: false, error: existingFolder(destination) };
  // Record the destination, not the typed folder: the host derives the folder
  // from the name, so the record and the created workspace agree from the start.
  return { ok: true, placement: { name, folder: destination, workspaceId: null } };
}

function existingFolder(folder: string): string {
  return `The folder ${folder} already exists. Choose another folder, or choose Existing workspace to use it.`;
}
