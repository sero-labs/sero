/**
 * The provider-neutral asset tool handed to the generating model.
 *
 * The plugin never inserts a mandatory generation step — this tool is simply
 * available, and the model decides whether a design needs illustrative
 * artwork. Results are downloaded into Design storage immediately, so the
 * generated code only ever references a local path.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

import { designAssetDir } from '../../shared/paths';
import { newId } from '../../shared/ids';
import type { GeneratedAssetRecord } from '../../shared/records';
import type { StoragePaths } from '../../shared/paths';
import { placeholderSvg, type AssetProviderRegistry } from './registry';
import type { AssetCapability, AssetGenerationRequest } from './contract';

const Params = Type.Object({
  prompt: Type.String({ description: 'What the illustrative artwork should depict' }),
  capability: StringEnum(['illustration', 'texture', 'background'] as const),
  aspectRatio: Type.Optional(StringEnum(['1:1', '4:3', '3:4', '16:9', '9:16'] as const)),
  title: Type.Optional(Type.String({ description: 'Short label for the asset tray' })),
});

export interface AssetToolDeps {
  paths: StoragePaths;
  designId: string;
  registry: AssetProviderRegistry;
  secret(name: string): Promise<string | null>;
  now(): number;
  signal?: AbortSignal;
  /** Called with each produced asset so the coordinator can persist it. */
  onAsset(record: GeneratedAssetRecord): void;
}

/**
 * Generate one asset and return the local path the design must reference.
 * A provider failure yields a local placeholder with asset-only retry rather
 * than failing the variant.
 */
export async function generateAsset(
  deps: AssetToolDeps,
  request: AssetGenerationRequest & { title?: string },
): Promise<{ record: GeneratedAssetRecord; localPath: string }> {
  const assetId = newId('ast', deps.now());
  const dir = designAssetDir(deps.paths, deps.designId, assetId);
  await mkdir(dir, { recursive: true });

  const provider = deps.registry.forCapability(request.capability);
  const startedAt = deps.now();

  const result = provider
    ? await provider.generate(request, {
      secret: deps.secret,
      now: deps.now,
      ...(deps.signal ? { signal: deps.signal } : {}),
    })
    : null;

  const title = request.title ?? request.prompt.slice(0, 40);

  if (result?.ok) {
    const fileName = `asset.${result.asset.fileExtension}`;
    await writeFile(path.join(dir, fileName), result.asset.data);
    const record: GeneratedAssetRecord = {
      id: assetId,
      designId: deps.designId,
      title,
      prompt: request.prompt,
      status: 'ready',
      fileName,
      mimeType: result.asset.mimeType,
      byteLength: result.asset.data.byteLength,
      provenance: result.provenance,
      history: [],
      createdAt: startedAt,
    };
    deps.onAsset(record);
    return { record, localPath: `assets/${assetId}/${fileName}` };
  }

  const fileName = 'placeholder.svg';
  await writeFile(path.join(dir, fileName), placeholderSvg(title), 'utf8');
  const record: GeneratedAssetRecord = {
    id: assetId,
    designId: deps.designId,
    title,
    prompt: request.prompt,
    status: 'placeholder',
    fileName,
    mimeType: 'image/svg+xml',
    byteLength: placeholderSvg(title).length,
    provenance: {
      toolId: 'design_library_generate_asset',
      providerId: provider?.id ?? 'none',
      modelId: 'placeholder',
      prompt: request.prompt,
      parameters: { capability: request.capability, aspectRatio: request.aspectRatio ?? '1:1' },
      startedAt,
      completedAt: deps.now(),
      ...(result && !result.ok
        ? { providerExtension: { errorKind: result.kind, message: result.message, retryable: result.retryable } }
        : { providerExtension: { errorKind: 'not-configured', message: 'No asset provider is available.' } }),
    },
    history: [],
    createdAt: startedAt,
  };
  deps.onAsset(record);
  return { record, localPath: `assets/${assetId}/${fileName}` };
}

/** Pi tool definition wrapping `generateAsset` for one Design's generation run. */
export function createAssetTool(deps: AssetToolDeps) {
  return {
    name: 'design_library_generate_asset',
    label: 'Generate artwork',
    description:
      'Generate one piece of illustrative artwork for the design you are building and return the local '
      + 'path to reference. Use only for illustrative imagery — interface icons come from the approved '
      + 'bundled icon set. If generation is unavailable a local placeholder is returned instead, and the '
      + 'design must still render correctly.',
    parameters: Params,
    async execute(_toolCallId: string, params: {
      prompt: string;
      capability: AssetCapability;
      aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
      title?: string;
    }) {
      const { record, localPath } = await generateAsset(deps, params);
      return {
        content: [{
          type: 'text',
          text: record.status === 'ready'
            ? `Artwork stored. Reference it as ${localPath}.`
            : `Artwork could not be generated; a placeholder is stored. Reference it as ${localPath}.`,
        }],
        details: { assetId: record.id, localPath, status: record.status },
      };
    },
  };
}
