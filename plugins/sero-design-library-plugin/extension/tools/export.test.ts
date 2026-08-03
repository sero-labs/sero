import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import { designLibraryPathsFromHome, galleryVersionRecordFile, type DesignLibraryPaths } from '../../shared/paths';
import { readStateWithIndexes, writeJsonFile } from '../../shared/state-io';
import { registerExportTool } from './export';

let home: string;
let paths: DesignLibraryPaths;
let tool: ToolDefinition;

function collectTool(): ExtensionAPI {
  return {
    registerTool(definition: ToolDefinition) {
      tool = definition;
    },
  } as unknown as ExtensionAPI;
}

async function call(params: Record<string, unknown>) {
  return tool.execute('call', params, new AbortController().signal, () => undefined, undefined as never);
}

function resultText(result: { content: Array<{ type: string }> }): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-export-tool-'));
  paths = designLibraryPathsFromHome(home);
  registerExportTool(collectTool(), paths);
  await writeJsonFile(galleryVersionRecordFile(paths, 'fam-1', 'ver-1'), {
    id: 'ver-1', familyId: 'fam-1', sourceDesignId: 'dsn-1', sourceVariantId: 'var-1',
    sourceRevisionId: 'rev-1', sourceJobId: 'job-1', previewFile: 'preview.png',
    files: [{ name: 'index.html', bytes: 1, checksum: 'sum' }], assets: [],
    references: [{ itemId: 'itm-1', order: 0, title: 'Reference' }],
    title: 'Signal', name: 'Signal', target: 'html', tweakOverrides: {},
    effectiveTweakValues: {}, dependencyManifest: [], brief: {}, guardrails: {},
  });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('Design Library export tool', () => {
  it('queues an exact Gallery version for the chosen destination', async () => {
    const result = await call({
      action: 'run', familyId: 'fam-1', versionId: 'ver-1', destination: 'workspace',
      workspacePath: '/workspace',
    });
    const request = (await readStateWithIndexes(paths)).requests[0];

    expect(result.details).toEqual({ exportId: expect.any(String) });
    expect(request?.body).toMatchObject({
      kind: 'export.run', familyId: 'fam-1', versionId: 'ver-1', destination: 'workspace',
      workspacePath: '/workspace',
    });
  });

  it('refuses an unknown destination before it queues work', async () => {
    const result = await call({
      action: 'run', familyId: 'fam-1', versionId: 'ver-1', destination: 'desktop',
    });

    expect(resultText(result)).toContain('downloads');
    expect((await readStateWithIndexes(paths)).requests).toEqual([]);
  });

  it('reports the latest export status', async () => {
    await writeJsonFile(paths.exportsIndexFile, [{
        id: 'exp-1', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
        status: 'succeeded', createdAt: 1, completedAt: 2, path: '/Downloads/signal',
    }]);

    const result = await call({ action: 'status' });
    expect(resultText(result)).toContain('/Downloads/signal');
  });
});
