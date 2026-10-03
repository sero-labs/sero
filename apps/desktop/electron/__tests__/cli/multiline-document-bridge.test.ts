/**
 * A multi-line document through the real CLI bridge.
 *
 * The bridge runs one command per line, so a newline inside a flag value ends
 * the command. A plugin tool that takes a document therefore takes it as one
 * JSON string. This test sends newline-rich Markdown through the bridge to the
 * Architect owner tool's own schema and decoder, and checks the text arrives
 * as written. The plugin's own tests cover the second half, to the record.
 */

import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyntheticSourceInfo, type LoadExtensionsResult, type ToolDefinition } from '@earendil-works/pi-coding-agent';

import { bridgeExtensionTools, getCliRegistry, resetCliRegistryForTests } from '@electron/cli';
import { executeCliBatch } from '@electron/cli/core/tool';
import type { CliCommandContext } from '@electron/cli/core/types';
import { workspaceManager } from '@electron/shared/infra/shared-infra';

/**
 * The plugin's own schema and decoder, loaded when the test runs. A static
 * import would compile the plugin's sources under the desktop's compiler
 * settings, which are not the plugin's.
 */
interface OwnerToolModule {
  OwnerToolParams: ToolDefinition['parameters'];
  buildOwnerActionInput(params: Record<string, unknown>): Record<string, unknown>;
}
const OWNER_TOOL_PATH = path.resolve(__dirname, '../../../../../plugins/sero-architect-plugin/extension/owner-tool.ts');
let ownerTool: OwnerToolModule;

const MARKDOWN = '# Mini synth\n\nKeys **A to K** play one octave.\n\n- no frameworks\n- it says "offline"\n';

/** What the owner is told to write: one JSON string, with a quote as ". */
const asFlag = (text: string): string => `'${JSON.stringify(text).replace(/\\"/g, '\\u0022')}'`;

const context: CliCommandContext = {
  workspaceId: 'ws-1',
  cwd: '/tmp/ws-1',
  invocation: { workspaceId: 'ws-1', sessionId: null, turnId: null, source: 'tool' },
  workspaceManager: {} as never,
  containerManager: {} as never,
};

describe('a multi-line document through the CLI bridge', () => {
  let tmpDir = '';
  const received: Record<string, unknown>[] = [];

  beforeAll(async () => {
    ownerTool = await import(/* @vite-ignore */ OWNER_TOOL_PATH) as OwnerToolModule;
  });

  beforeEach(async () => {
    resetCliRegistryForTests();
    received.length = 0;
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'multiline-bridge-'));
    const extensionPath = path.join(tmpDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: '@test/architect', version: '1.0.0', sero: { plugin: { bridgeTools: ['architect'] } } }), 'utf8');
    const tool: ToolDefinition = {
      name: 'architect',
      label: 'Architect',
      description: 'The Architect owner tool schema.',
      parameters: ownerTool.OwnerToolParams,
      execute: async (_id, params) => {
        received.push(params as Record<string, unknown>);
        return { content: [{ type: 'text', text: 'ok' }], details: null };
      },
    };
    const sourceInfo = createSyntheticSourceInfo(extensionPath, { source: 'extension' });
    const loaded: LoadExtensionsResult = {
      extensions: [{
        path: extensionPath, resolvedPath: extensionPath, sourceInfo, handlers: new Map(),
        tools: new Map([[tool.name, { definition: tool, sourceInfo }]]),
        messageRenderers: new Map(), commands: new Map(), flags: new Map(), shortcuts: new Map(),
      }],
      errors: [],
      runtime: {} as LoadExtensionsResult['runtime'],
    };
    bridgeExtensionTools(loaded);
  });

  afterEach(async () => {
    resetCliRegistryForTests();
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('delivers the JSON form as written', async () => {
    const batch = await executeCliBatch(getCliRegistry(), `architect --action brief --projectId proj_1 --textJson ${asFlag(MARKDOWN)}`, context);
    expect(batch.exitCode, batch.output).toBe(0);
    expect(received).toHaveLength(1);
    const input = ownerTool.buildOwnerActionInput(received[0]!);
    expect(input).toMatchObject({ action: 'brief', projectId: 'proj_1', text: MARKDOWN });
  });

  it('cannot deliver the same text as a plain flag', async () => {
    const batch = await executeCliBatch(getCliRegistry(), `architect --action brief --projectId proj_1 --text "${MARKDOWN.replace(/"/g, '')}"`, context);
    // Each line is run as its own command, so the document never arrives whole.
    expect(received.some((params) => params.text === MARKDOWN.replace(/"/g, ''))).toBe(false);
    expect(batch.exitCode).not.toBe(0);
  });
});
