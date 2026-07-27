/**
 * `design_library_design_assets`, `design_library_gallery` and
 * `design_library_export`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  assertSafeId,
  designAssetDir,
  designRecordPath,
  familyRecordPath,
  versionDir,
} from '../../shared/paths';
import { readJsonFile } from '../../shared/state-io';
import { newId } from '../../shared/ids';
import type { DesignRecord, GalleryFamilyRecord, GalleryVersionSnapshot } from '../../shared/records';
import { fail, image, ok, resolvePaths, submitRequest, type ToolOutput } from '../context';

const AssetParams = Type.Object({
  action: StringEnum(['list', 'read', 'retry', 'delete', 'promote'] as const),
  designId: Type.String(),
  assetId: Type.Optional(Type.String()),
});

export function createDesignAssetsTool(): ToolDefinition<typeof AssetParams> {
  return {
    name: 'design_library_design_assets',
    label: 'Design Library design assets',
    description:
      'Manage the Design asset tray. Actions: list, read (assetId), retry (assetId), delete (assetId), '
      + 'promote (assetId) to copy an asset into the Library as an independent item.',
    parameters: AssetParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);
      assertSafeId(params.designId, 'designId');

      if (params.action === 'list') {
        const design = await readJsonFile<DesignRecord>(designRecordPath(paths, params.designId));
        if (!design) return fail(`Unknown Design ${params.designId}.`);
        const assets = design.assets.filter((asset) => asset.deletedAt === undefined);
        return ok(`${assets.length} assets.`, { assets });
      }

      if (!params.assetId) return fail('assetId is required.');
      assertSafeId(params.assetId, 'assetId');

      if (params.action === 'read') {
        const design = await readJsonFile<DesignRecord>(designRecordPath(paths, params.designId));
        const asset = design?.assets.find((entry) => entry.id === params.assetId);
        if (!asset) return fail(`Unknown asset ${params.assetId}.`);
        const bytes = await readFile(
          path.join(designAssetDir(paths, params.designId, asset.id), asset.fileName),
        ).catch(() => null);
        if (!bytes) return fail('The stored asset is missing.');
        return image(bytes.toString('base64'), asset.mimeType, asset.title, { asset });
      }

      const action = params.action === 'retry'
        ? 'design-asset.retry'
        : params.action === 'delete'
          ? 'design-asset.delete'
          : 'design-asset.promote';
      await submitRequest(paths, action, { designId: params.designId, assetId: params.assetId });
      return ok(`${params.action} queued.`);
    },
  };
}

const GalleryParams = Type.Object({
  action: StringEnum([
    'save',
    'feature',
    'open',
    'read_version',
    'read_preview',
    'duplicate',
    'remix',
    'delete',
    'restore',
    'purge',
  ] as const),
  familyId: Type.Optional(Type.String()),
  versionId: Type.Optional(Type.String()),
  designId: Type.Optional(Type.String()),
  variantId: Type.Optional(Type.String()),
  request: Type.Optional(Type.String()),
});

export function createGalleryTool(): ToolDefinition<typeof GalleryParams> {
  return {
    name: 'design_library_gallery',
    label: 'Design Library gallery',
    description:
      'Save and manage immutable Gallery versions. Actions: save (designId, variantId, familyId?), '
      + 'feature (familyId, versionId), open (familyId), read_version, read_preview, duplicate, remix, '
      + 'delete, restore, purge.',
    parameters: GalleryParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);

      if (params.action === 'save') {
        if (!params.designId || !params.variantId) {
          return fail('designId and variantId are required.');
        }
        assertSafeId(params.designId, 'designId');
        assertSafeId(params.variantId, 'variantId');
        if (params.familyId) assertSafeId(params.familyId, 'familyId');
        await submitRequest(paths, 'gallery.save', {
          designId: params.designId,
          variantId: params.variantId,
          ...(params.familyId ? { familyId: params.familyId } : {}),
        });
        return ok('Gallery save queued.');
      }

      if (!params.familyId) return fail('familyId is required.');
      assertSafeId(params.familyId, 'familyId');

      if (params.action === 'open') {
        const family = await readJsonFile<GalleryFamilyRecord>(familyRecordPath(paths, params.familyId));
        if (!family) return fail(`Unknown Gallery family ${params.familyId}.`);
        return ok(`${family.title} (${family.versionIds.length} versions)`, { family });
      }

      if (params.action === 'delete' || params.action === 'restore' || params.action === 'purge') {
        if (params.versionId) assertSafeId(params.versionId, 'versionId');
        const action = params.action === 'delete'
          ? 'gallery.delete'
          : params.action === 'restore'
            ? 'gallery.restore'
            : 'gallery.purge';
        await submitRequest(paths, action, {
          familyId: params.familyId,
          ...(params.versionId ? { versionId: params.versionId } : {}),
        });
        return ok(`${params.action} queued.`);
      }

      if (!params.versionId) return fail('versionId is required.');
      assertSafeId(params.versionId, 'versionId');
      const dir = versionDir(paths, params.familyId, params.versionId);

      switch (params.action) {
        case 'feature': {
          await submitRequest(paths, 'gallery.feature', {
            familyId: params.familyId,
            versionId: params.versionId,
          });
          return ok('Featured version queued.');
        }

        case 'read_version': {
          const snapshot = await readJsonFile<GalleryVersionSnapshot>(path.join(dir, 'version.json'));
          if (!snapshot) return fail(`Unknown Gallery version ${params.versionId}.`);
          return ok(snapshot.title, { version: snapshot });
        }

        case 'read_preview': {
          const snapshot = await readJsonFile<GalleryVersionSnapshot>(path.join(dir, 'version.json'));
          if (!snapshot) return fail(`Unknown Gallery version ${params.versionId}.`);
          const html = await readFile(path.join(dir, snapshot.previewFileName), 'utf8').catch(() => null);
          if (html === null) return fail('The saved preview is missing.');
          return ok(html, { versionId: snapshot.id, title: snapshot.title });
        }

        case 'duplicate': {
          await submitRequest(paths, 'gallery.duplicate', {
            familyId: params.familyId,
            versionId: params.versionId,
            newFamilyId: newId('fam'),
          });
          return ok('Duplicate queued.');
        }

        case 'remix': {
          await submitRequest(paths, 'gallery.remix', {
            familyId: params.familyId,
            versionId: params.versionId,
            newFamilyId: newId('fam'),
            designId: newId('dsn'),
            request: params.request ?? '',
          });
          return ok('Remix queued.');
        }

        default:
          return fail(`Unsupported action ${params.action}.`);
      }
    },
  };
}

const ExportParams = Type.Object({
  familyId: Type.String(),
  versionId: Type.String(),
  destination: StringEnum(['downloads', 'workspace'] as const),
  workspacePath: Type.Optional(Type.String()),
});

export function createExportTool(): ToolDefinition<typeof ExportParams> {
  return {
    name: 'design_library_export',
    label: 'Design Library export',
    description:
      'Export a saved Gallery version exactly as stored, with effective tweak values resolved into the '
      + 'output and a small metadata manifest. Destinations: downloads, workspace.',
    parameters: ExportParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);
      assertSafeId(params.familyId, 'familyId');
      assertSafeId(params.versionId, 'versionId');
      if (params.destination === 'workspace' && !params.workspacePath && !ctx?.cwd) {
        return fail('No workspace is available for a workspace export.');
      }
      await submitRequest(paths, 'export.version', {
        familyId: params.familyId,
        versionId: params.versionId,
        destination: params.destination,
        ...(params.destination === 'workspace'
          ? { workspacePath: params.workspacePath ?? ctx?.cwd ?? '' }
          : {}),
      });
      return ok(`Export to ${params.destination} queued.`);
    },
  };
}
