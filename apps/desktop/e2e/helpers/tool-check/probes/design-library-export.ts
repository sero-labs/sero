/**
 * `design_library_export`: writing a saved Gallery version out as a
 * standalone page. The probe exports to Downloads, which in the test app is
 * the temporary home's folder, so the workspace stays as other probes expect it.
 * Source: plugins/sero-design-library-plugin/extension/tools/export.ts, runtime/export.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { createReadyDesign, saveToGallery, type GalleryFamilyView } from './design-library-fixtures';
import { installModelStub, PAGE_MARKER, removeModelStub } from './design-library-stub';
import { invoke, poll, readJsonFile, saved } from './design-library-support';

const TOOL = 'design_library_export';

const family = (ctx: StepContext) => saved<GalleryFamilyView>(ctx, 'family');
const version = (ctx: StepContext) => family(ctx).versions[0]!.id;

/** The folder an `Exported to <path>.` answer names, once the export has finished. */
function exportedPath(text: string): string | null {
  const match = /^Exported to (.+)\.$/.exec(text);
  return match ? match[1]! : null;
}

function expectExportFolder(folder: string, ctx: StepContext): void {
  if (!fs.readFileSync(path.join(folder, 'index.html'), 'utf8').includes('Generated page')) throw new Error(`${folder}/index.html is not the saved page`);
  // The manifest names the Gallery version the export was made from (runtime/export.ts EXPORT_MANIFEST_FILE).
  const manifest = readJsonFile(path.join(folder, 'design-library.json')) as { familyId?: string; versionId?: string } | null;
  if (manifest?.familyId !== family(ctx).id || manifest.versionId !== version(ctx)) {
    throw new Error(`the export manifest names ${JSON.stringify(manifest)}`);
  }
  const source = fs.readFileSync(path.join(folder, 'source', 'index.html'), 'utf8');
  if (!source.includes(PAGE_MARKER)) throw new Error('the export holds no copy of the source');
}

export const designLibraryExportProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      action: 'run',
      setup: async (ctx) => {
        installModelStub(ctx);
        const design = await createReadyDesign(ctx);
        ctx.state.family = (await saveToGallery(ctx, design, 1)).family;
      },
      params: (ctx) => ({ action: 'run', familyId: family(ctx).id, versionId: version(ctx), destination: 'downloads' }),
      async expect(result, ctx) {
        expectText(result, 'Exporting that exact Gallery version to Downloads.');
        const answer = await poll(ctx, 'the export to finish', async () => {
          const status = await invoke(ctx, TOOL, { action: 'status' });
          if (status.text.startsWith('Export failed')) throw new Error(status.text);
          return exportedPath(status.text) === null ? null : status.text;
        });
        const folder = exportedPath(answer)!;
        expectExportFolder(folder, ctx);
        ctx.state.exportFolder = folder;
      },
    },
    {
      action: 'status',
      params: { action: 'status' },
      expect(result, ctx) {
        expectText(result, `Exported to ${saved<string>(ctx, 'exportFolder')}.`);
        removeModelStub(ctx);
      },
    },
  ],
};
