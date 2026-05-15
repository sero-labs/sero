import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareToolImage: vi.fn(),
}));

vi.mock('@electron/shared/media/image-resize', () => ({
  prepareToolImage: mocks.prepareToolImage,
}));

import { CliRegistry } from '@electron/cli/core/registry';
import { createSeroCliTool } from '@electron/cli/core/tool';
import { bridgeToolUpdate } from '@electron/cli/core/invocation-context';
import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { workspaceManager } from '@electron/shared/infra/shared-infra';
import { attachmentsToImages } from '@electron/ipc/agent/core/agent-messages';

describe('CLI image content normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.prepareToolImage.mockReset();
    mocks.prepareToolImage.mockReturnValue({
      data: 'resized-image',
      mimeType: 'image/jpeg',
      text: '[Image: resized for API]',
      resize: {},
    });
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');
    installCliSessionBridge({
      getSessionEntry: () => undefined,
      getActiveSessionForWorkspace: () => undefined,
      getActiveTurnId: () => null,
      noteTurnStart: () => {},
      noteTurnEnd: () => {},
      consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
      setSessionTitle: () => {},
    });
  });

  it('routes single-command image results through prepareToolImage before returning to the model', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'capture',
      summary: 'Capture',
      execute: async () => ({
        output: 'Captured tab tab-1',
        exitCode: 0,
        content: [{ type: 'image', data: 'raw-image', mimeType: 'image/png' }],
      }),
    });

    const tool = createSeroCliTool(registry, 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'capture' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(mocks.prepareToolImage).toHaveBeenCalledWith('raw-image', 'image/png');
    expect(result.content).toEqual([
      { type: 'text', text: 'Captured tab tab-1' },
      { type: 'text', text: '[Image: resized for API]' },
      { type: 'image', data: 'resized-image', mimeType: 'image/jpeg' },
    ]);
  });

  it('routes chat image attachments through prepareToolImage', () => {
    const image = attachmentsToImages([
      {
        id: 'attachment-1',
        filename: 'shot.png',
        mediaType: 'image/png',
        url: 'data:image/png;base64,raw-attachment',
      },
    ]);

    expect(mocks.prepareToolImage).toHaveBeenCalledWith('raw-attachment', 'image/png');
    expect(image).toEqual([{ type: 'image', data: 'resized-image', mimeType: 'image/jpeg' }]);
  });

  it('routes streaming image updates through prepareToolImage', () => {
    const onUpdate = vi.fn();
    const bridged = bridgeToolUpdate(onUpdate);

    bridged?.({
      content: [{ type: 'image', data: 'raw-update', mimeType: 'image/png' }],
      details: { stage: 'capture' },
    });

    expect(mocks.prepareToolImage).toHaveBeenCalledWith('raw-update', 'image/png');
    expect(onUpdate).toHaveBeenCalledWith({
      content: [
        { type: 'text', text: '[Image: resized for API]' },
        { type: 'image', data: 'resized-image', mimeType: 'image/jpeg' },
      ],
      details: { stage: 'capture' },
    });
  });
});
