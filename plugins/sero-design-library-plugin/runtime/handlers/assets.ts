/**
 * Design-owned generated assets.
 *
 * A successful retry replaces the visible placeholder and keeps the superseded
 * state in the asset's history, so nothing is lost.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { designAssetDir, designRecordPath } from '../../shared/paths';
import { mutateRecord, readRecord } from '../../shared/state-io';
import type { DesignRecord, GeneratedAssetRecord } from '../../shared/records';
import type { AssetProviderRegistry } from '../asset-generation/registry';
import type { AssetCapability } from '../asset-generation/contract';
import type { RuntimeHost } from '../host';

export interface RetryAssetInput {
  designId: string;
  assetId: string;
  signal?: AbortSignal;
}

export async function retryAsset(
  host: RuntimeHost,
  registry: AssetProviderRegistry,
  input: RetryAssetInput,
): Promise<{ replaced: boolean; message: string }> {
  const design = await readRecord<DesignRecord>(designRecordPath(host.paths, input.designId));
  const asset = design?.assets.find((entry) => entry.id === input.assetId);
  if (!asset) throw new Error(`Unknown asset ${input.assetId}.`);

  const capability = (asset.provenance.parameters.capability as AssetCapability | undefined) ?? 'illustration';
  const provider = registry.forCapability(capability);
  if (!provider) return { replaced: false, message: 'No asset provider is available.' };

  const result = await provider.generate(
    {
      prompt: asset.prompt,
      capability,
      ...(typeof asset.provenance.parameters.aspectRatio === 'string'
        ? { aspectRatio: asset.provenance.parameters.aspectRatio as '1:1' }
        : {}),
    },
    {
      secret: host.secret,
      now: host.now,
      ...(input.signal ? { signal: input.signal } : {}),
    },
  );

  if (!result.ok) return { replaced: false, message: result.message };

  const fileName = `asset.${result.asset.fileExtension}`;
  await writeFile(
    path.join(designAssetDir(host.paths, input.designId, input.assetId), fileName),
    result.asset.data,
  );

  await mutateRecord<DesignRecord>(designRecordPath(host.paths, input.designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${input.designId}.`);
    return {
      ...current,
      assets: current.assets.map((entry): GeneratedAssetRecord =>
        entry.id === input.assetId
          ? {
            ...entry,
            status: 'ready',
            fileName,
            mimeType: result.asset.mimeType,
            byteLength: result.asset.data.byteLength,
            provenance: result.provenance,
            history: [
              ...entry.history,
              { status: entry.status, fileName: entry.fileName, at: host.now() },
            ],
          }
          : entry),
      updatedAt: host.now(),
    };
  });

  return { replaced: true, message: 'Artwork replaced.' };
}
