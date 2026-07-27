/**
 * Variant generation and revision.
 *
 * One variant is one independently cancellable unit of work. A failure or a
 * cancellation here never touches a sibling variant, and every successful
 * revision carries its own validated tweak manifest.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { designAssetsRoot, designRecordPath, revisionDir } from '../../shared/paths';
import { mutateRecord, readRecord } from '../../shared/state-io';
import { newId } from '../../shared/ids';
import { collectDeclaredCssVariables, validateTweakManifest } from '../../shared/tweaks';
import type {
  DesignRecord,
  GeneratedAssetRecord,
  SourceFile,
  VariantRevisionRecord,
} from '../../shared/records';
import type { EditableLibrarianProfile, OutputTarget } from '../../shared/types';
import type { RuntimeHost } from '../host';
import { extractJson } from '../librarian/prompt';
import { createAssetTool } from '../asset-generation/tool';
import type { AssetProviderRegistry } from '../asset-generation/registry';
import { buildHtmlPreview, buildReactPreview, loadPreviewAssets, type ReactBuildDeps } from '../preview/build';
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationTask,
  validateGenerationReply,
} from './prompt';

export interface GenerateVariantInput {
  designId: string;
  variantId: string;
  variantIndex: number;
  variantCount: number;
  references: EditableLibrarianProfile[];
  request: string;
  outputTarget: OutputTarget;
  revision?: { instruction: string; files: SourceFile[] };
  signal?: AbortSignal;
}

export interface GenerationDeps {
  registry: AssetProviderRegistry;
  /** Absent when the React toolchain could not be loaded. */
  react?: ReactBuildDeps;
}

function parseFiles(value: unknown): SourceFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SourceFile[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.path !== 'string' || typeof record.contents !== 'string') return [];
    // Generated paths are labels inside the revision, never filesystem writes.
    if (record.path.includes('..') || record.path.startsWith('/')) return [];
    return [{ path: record.path, contents: record.contents }];
  });
}

export interface GeneratedRevision {
  revision: VariantRevisionRecord;
  title: string;
  previewWarnings: string[];
}

/**
 * Run one variant. Returns the new revision, or throws with a message the job
 * record keeps so the variant can be retried independently.
 */
export async function generateVariant(
  host: RuntimeHost,
  deps: GenerationDeps,
  input: GenerateVariantInput,
): Promise<GeneratedRevision> {
  const producedAssets: GeneratedAssetRecord[] = [];
  const assetTool = createAssetTool({
    paths: host.paths,
    designId: input.designId,
    registry: deps.registry,
    secret: host.secret,
    now: host.now,
    onAsset: (record) => producedAssets.push(record),
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const result = await host.runModel({
    task: buildGenerationTask({
      request: input.request,
      outputTarget: input.outputTarget,
      references: input.references,
      variantIndex: input.variantIndex,
      variantCount: input.variantCount,
      ...(input.revision ? { revision: input.revision } : {}),
    }),
    systemPrompt: GENERATION_SYSTEM_PROMPT,
    platformTools: 'none',
    customTools: [assetTool],
    repair: { maxAttempts: 3, validate: validateGenerationReply(input.outputTarget) },
    sessionKey: `generate:${input.designId}:${input.variantId}`,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  // Assets produced before a failure are still persisted so a retry can reuse them.
  await persistAssets(host, input.designId, producedAssets);

  if (result.error) throw new Error(result.error);

  const parsed = extractJson(result.response) as Record<string, unknown> | null;
  if (!parsed) throw new Error('The generator did not return a usable result.');

  const files = parseFiles(parsed.files);
  if (files.length === 0) throw new Error('The generator returned no files.');

  const css = files.find((file) => file.path === 'styles.css')?.contents ?? '';
  const revisionId = newId('rev', host.now());
  const { manifest, dropped } = validateTweakManifest(
    parsed.tweaks,
    revisionId,
    collectDeclaredCssVariables(css),
  );

  const revision: VariantRevisionRecord = {
    id: revisionId,
    variantId: input.variantId,
    revisionNumber: 0,
    outputTarget: input.outputTarget,
    files,
    assetIds: producedAssets.map((asset) => asset.id),
    tweakManifest: manifest,
    tweakOverrides: {},
    droppedTweakControls: dropped,
    createdAt: host.now(),
    createdReason: input.revision ? 'revised' : 'generated',
  };

  const warnings = await writeRevisionPreview(host, deps, input.designId, revision, producedAssets);

  return {
    revision,
    title: typeof parsed.title === 'string' && parsed.title.trim() !== ''
      ? parsed.title.trim()
      : `Variant ${input.variantIndex + 1}`,
    previewWarnings: warnings,
  };
}

async function persistAssets(
  host: RuntimeHost,
  designId: string,
  assets: GeneratedAssetRecord[],
): Promise<void> {
  if (assets.length === 0) return;
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${designId}.`);
    const known = new Set(current.assets.map((asset) => asset.id));
    return {
      ...current,
      assets: [...current.assets, ...assets.filter((asset) => !known.has(asset.id))],
      updatedAt: host.now(),
    };
  });
}

/**
 * Build and store the runnable preview for a revision. Preview failure is a
 * warning, never a lost revision — the code is still saved and exportable.
 */
export async function writeRevisionPreview(
  host: RuntimeHost,
  deps: GenerationDeps,
  designId: string,
  revision: VariantRevisionRecord,
  assets: GeneratedAssetRecord[],
): Promise<string[]> {
  const dir = revisionDir(host.paths, designId, revision.variantId, revision.id);
  await mkdir(dir, { recursive: true });

  const previewAssets = await loadPreviewAssets(
    designAssetsRoot(host.paths, designId),
    assets.map((asset) => ({ id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType })),
  );

  const input = {
    title: `Variant preview`,
    files: revision.files,
    assets: previewAssets,
    manifest: revision.tweakManifest,
  };

  try {
    const built = revision.outputTarget === 'react-tailwind'
      ? deps.react
        ? await buildReactPreview(input, deps.react)
        : { html: '', warnings: ['The React preview toolchain is unavailable on this machine.'] }
      : buildHtmlPreview(input);

    if (built.html) {
      await writeFile(path.join(dir, 'preview.html'), built.html, 'utf8');
    }
    return built.warnings;
  } catch (error) {
    return [`The preview could not be built: ${error instanceof Error ? error.message : String(error)}`];
  }
}

export async function readDesign(host: RuntimeHost, designId: string): Promise<DesignRecord> {
  const design = await readRecord<DesignRecord>(designRecordPath(host.paths, designId));
  if (!design) throw new Error(`Unknown Design ${designId}.`);
  return design;
}
