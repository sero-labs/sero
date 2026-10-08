/**
 * The pictures a project board shows: the screenshot a check saved for a step,
 * and the last screenshot the Architect took in its browser.
 *
 * Both are files in the project folder. The runtime reads them here and hands
 * the bytes to the view, which cannot read a file itself.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ProjectRecord } from '../shared/record';

/** A screenshot is well under this. A larger file is not one the board shows. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Where the automation browser saves a screenshot in a host workspace. */
const BROWSER_SHOT = path.join('.sero', 'tmp', 'automation-browser-shot.png');

export type PictureOutcome = { ok: true; text: string; dataUrl: string; at: string } | { ok: false; text: string };

/** The file a request names, or why there is none. Only two places are ever read. */
function pictureFile(record: ProjectRecord, milestoneId: string | undefined): string | null {
  if (!milestoneId) return path.join(record.folder, BROWSER_SHOT);
  const capture = record.milestones.find((milestone) => milestone.id === milestoneId)?.evidence?.preview?.capturePath;
  if (!capture) return null;
  // The record holds the path. It is used only inside the project's own evidence folder.
  const evidence = path.join(record.folder, '.sero', 'apps', 'architect', 'evidence') + path.sep;
  return path.resolve(capture).startsWith(evidence) ? path.resolve(capture) : null;
}

/**
 * Reads a step's proof picture, or the browser's last screenshot when no step is
 * named. With `newerThan`, a picture the view already holds is not sent again.
 */
export async function readPicture(record: ProjectRecord, milestoneId: string | undefined, newerThan?: string): Promise<PictureOutcome> {
  const file = pictureFile(record, milestoneId);
  if (!file) return { ok: false, text: 'No picture is saved for this step.' };
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return { ok: false, text: 'The picture cannot be shown.' };
    if (newerThan && stat.mtime.toISOString() <= newerThan) return { ok: false, text: 'No newer picture.' };
    const bytes = await fs.readFile(file);
    return { ok: true, text: 'Picture read.', dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, at: stat.mtime.toISOString() };
  } catch {
    return { ok: false, text: 'No picture is saved.' };
  }
}
