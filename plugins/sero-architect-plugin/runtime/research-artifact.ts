/**
 * Research artifacts.
 *
 * A completed research result is written beside the project so the owner
 * contract can reference it rather than embedding the whole report on every
 * wake. The owner session runs with the project folder as its working
 * directory and its only allowed cwd, so a path relative to that folder is
 * reachable under the owner's existing permissions and needs no new grant.
 *
 * Writing is best effort. A missing file must not fail a wake; the record says
 * whether the artifact is there, so the contract can say so too.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ResearchResult } from '../shared/record';
import type { RecordStore } from './record-store';

/** Relative to the project folder, which is the owner's granted directory. */
export const RESEARCH_ARTIFACT_DIR = '.sero/apps/architect/research';

/** The reference a contract shows for one result, relative to the owner's cwd. */
export function researchArtifactRef(id: string): string {
  return `${RESEARCH_ARTIFACT_DIR}/${id}.md`;
}

/** Writes one report and returns its reference, or null when it could not be saved. */
export async function writeResearchArtifact(folder: string, entry: ResearchResult): Promise<string | null> {
  const relative = researchArtifactRef(entry.id);
  try {
    const directory = path.join(folder, RESEARCH_ARTIFACT_DIR);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(folder, relative), researchReport(entry), 'utf8');
    return relative;
  } catch {
    return null;
  }
}

function researchReport(entry: ResearchResult): string {
  return [
    `# ${entry.question}`,
    '',
    `Stopping condition: ${entry.stoppingCondition}`,
    `Completed: ${entry.completedAt}`,
    ...(entry.roomId ? [`Room: ${entry.roomId}`] : []),
    ...(entry.workflowId ? [`Workflow: ${entry.workflowId}`] : []),
    '',
    entry.result,
    '',
  ].join('\n');
}

/**
 * Saves the report a result was recorded from and attaches its reference.
 *
 * Called after the result is already in the record, so a failed write costs the
 * reference and never the finding. An unwritable folder leaves `artifactPath`
 * absent, and the contract then says the detail is gone rather than pointing at
 * a file that is not there.
 */
export async function attachResearchArtifact(
  store: RecordStore,
  projectId: string,
  entryId: string,
): Promise<void> {
  const record = await store.read(projectId);
  const entry = record?.research.find((item) => item.id === entryId);
  if (!record || !entry || entry.artifactPath) return;
  const artifactPath = await writeResearchArtifact(record.folder, entry);
  if (!artifactPath) return;
  await store.update(projectId, (fresh) => ({
    ...fresh,
    research: fresh.research.map((item) => (item.id === entryId ? { ...item, artifactPath } : item)),
  })).catch(() => null);
}
