import type { OutputTarget } from '../../shared/design';
import type { EmittedFile } from '../../shared/targets';
import { buildHtmlDocument } from './html';
import { buildReactDocument, type ReactBuildOptions } from './react';
import type { BuildResult } from './types';

export type { BuildResult } from './types';

/** The one entry point: emitted files in, one self-contained document out. */
export async function buildPreviewDocument(
  target: OutputTarget,
  files: EmittedFile[],
  options: ReactBuildOptions = {},
): Promise<BuildResult> {
  return target === 'html' ? buildHtmlDocument(files) : buildReactDocument(files, options);
}

/** The document's file name inside a revision directory. */
export const PREVIEW_DOCUMENT_FILE = 'preview.html';
