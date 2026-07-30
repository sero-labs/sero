import type { OutputTarget } from '../../shared/design';
import type { EmittedFile } from '../../shared/targets';
import { inlineAssets, type BuildAsset } from './assets';
import { buildHtmlDocument } from './html';
import { buildReactDocument, type ReactBuildOptions } from './react';
import { assembleStandaloneDocument as assembleStandaloneOutput } from './standalone';
import type { BuildResult } from './types';

export type { BuildResult } from './types';
export type { BuildAsset } from './assets';

export interface PreviewBuildOptions extends ReactBuildOptions {
  /**
   * The custom properties the run declared controls for. Baked into the
   * document, which then accepts a live value for these and nothing else.
   */
  tweakVariables?: readonly string[];
  /** Generated media the page may refer to, folded in as `data:` URIs. */
  assets?: BuildAsset[];
}

/** The one entry point: emitted files in, one self-contained document out. */
export async function buildPreviewDocument(
  target: OutputTarget,
  files: EmittedFile[],
  options: PreviewBuildOptions = {},
): Promise<BuildResult> {
  const built =
    target === 'html'
      ? buildHtmlDocument(files, options.tweakVariables ?? [])
      : await buildReactDocument(files, options);

  // Assets are folded into the finished document rather than into each file:
  // one pass covers `src` in markup, `url()` in CSS and a path in a script,
  // and it cannot miss whichever of the three the model happened to use.
  if (built.document === undefined) return built;
  const inlined = inlineAssets(built.document, options.assets ?? []);
  return {
    document: inlined.document,
    warnings: [...built.warnings, ...inlined.warnings],
  };
}

/** The document's file name inside a revision directory. */
export const PREVIEW_DOCUMENT_FILE = 'preview.html';

/** Build the same saved source as a local page with no Sero preview runtime. */
export async function buildStandaloneDocument(
  target: OutputTarget,
  files: EmittedFile[],
  supplementalStyles: readonly string[] = [],
  rootVariables: Readonly<Record<string, string>> = {},
): Promise<BuildResult> {
  return target === 'html'
    ? buildHtmlDocument(files, [], assembleStandaloneOutput, supplementalStyles, rootVariables)
    : buildReactDocument(files, {
      assembleDocument: assembleStandaloneOutput,
      supplementalStyles,
      rootVariables,
    });
}
