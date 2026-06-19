import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fullScreenshot: vi.fn(),
  captureVisibleApp: vi.fn(),
  interact: vi.fn(),
  prepareToolImage: vi.fn(),
}));

vi.mock('@electron/features/apps/app-control/host-service', () => ({
  appControlHostService: {
    fullScreenshot: mocks.fullScreenshot,
    captureVisibleApp: mocks.captureVisibleApp,
    interact: mocks.interact,
  },
}));

vi.mock('@electron/shared/media/image-resize', () => ({
  prepareToolImage: mocks.prepareToolImage,
}));

import { handleScreenshot } from '@electron/cli/commands/apps/app-control-screenshot';
import { handleScreenshotAround } from '@electron/cli/commands/apps/app-control-interactions';
import type { CliCommandContext } from '@electron/cli/core/types';

function createContext(): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/ws-1',
    invocation: { workspaceId: 'ws-1', sessionId: 's1', turnId: 't1', source: 'tool' },
  } as CliCommandContext;
}

describe('app control screenshot image handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareToolImage.mockReturnValue({
      data: 'optimized-image',
      mimeType: 'image/jpeg',
      text: '[Image optimized for API]',
      resize: {},
    });
  });

  it('routes full-container screenshots through prepareToolImage before returning content', async () => {
    mocks.fullScreenshot.mockResolvedValue({
      base64: 'raw-full-image',
      target: { label: '.panel', clientWidth: 500, scrollHeight: 2000 },
    });

    const result = await handleScreenshot(['--selector', '.panel', '--full'], createContext());

    expect(mocks.fullScreenshot).toHaveBeenCalledWith('.panel');
    expect(mocks.prepareToolImage).toHaveBeenCalledWith(
      'raw-full-image',
      'image/png',
      'Full screenshot of .panel (500×2000 CSS px)',
    );
    expect(result.content).toEqual([
      { type: 'text', text: '[Image optimized for API]' },
      { type: 'image', data: 'optimized-image', mimeType: 'image/jpeg' },
    ]);
  });

  it('routes screenshot-around captures through prepareToolImage before returning content', async () => {
    mocks.interact.mockResolvedValue({ success: true, message: 'visible: true' });
    mocks.captureVisibleApp.mockResolvedValue({
      base64: 'raw-around-image',
      rect: { x: 0, y: 0, width: 600, height: 400 },
    });

    const result = await handleScreenshotAround(['--text', 'Read-only evidence'], createContext());

    expect(mocks.interact).toHaveBeenCalledWith({
      action: 'scroll-to',
      captureAfter: false,
      text: 'Read-only evidence',
    });
    expect(mocks.prepareToolImage).toHaveBeenCalledWith(
      'raw-around-image',
      'image/png',
      'Screenshot around Read-only evidence: visible: true\nScreenshot of active app (600×400 CSS px). For app click --x/--y, use coordinates relative to this image from the top-left corner.',
    );
    expect(result.content?.at(-1)).toEqual({
      type: 'image',
      data: 'optimized-image',
      mimeType: 'image/jpeg',
    });
  });
});
