import type { OutputTarget } from '../../shared/design';
import type { EmittedFile } from '../../shared/targets';
import { buildHtmlDocument } from './html';
import { buildReactDocument, type ReactBuildOptions } from './react';
import type { BuildResult } from './types';

export type { BuildResult } from './types';

export interface PreviewBuildOptions extends ReactBuildOptions {
  /**
   * The custom properties the run declared controls for. Baked into the
   * document, which then accepts a live value for these and nothing else.
   */
  tweakVariables?: readonly string[];
}

/** The one entry point: emitted files in, one self-contained document out. */
export async function buildPreviewDocument(
  target: OutputTarget,
  files: EmittedFile[],
  options: PreviewBuildOptions = {},
): Promise<BuildResult> {
  return target === 'html'
    ? buildHtmlDocument(files, options.tweakVariables ?? [])
    : buildReactDocument(files, options);
}

/** The document's file name inside a revision directory. */
export const PREVIEW_DOCUMENT_FILE = 'preview.html';
