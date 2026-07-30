// @vitest-environment jsdom

import type { AppTools } from '@sero-ai/app-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureGalleryPreview } from './gallery-capture';

afterEach(() => {
  Reflect.deleteProperty(window, 'sero');
});

describe('Gallery preview capture', () => {
  it('captures only the preview rectangle and uploads bounded chunks', async () => {
    const captureRegion = vi.fn(async () => btoa('preview-png'));
    Reflect.set(window, 'sero', { appControl: { captureRegion } });
    const run = vi.fn(async (_tool: string, params: Record<string, unknown>) => ({
      content: [{ type: 'text' as const, text: 'ok' }],
      details: params.action === 'begin' ? { uploadId: 'upl-1' } : {},
    }));
    const tools = { run } as unknown as AppTools;
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({
      x: 120, y: 80, width: 640, height: 480, top: 80, right: 760, bottom: 560, left: 120,
      toJSON: () => ({}),
    });

    await expect(captureGalleryPreview(tools, element)).resolves.toBe('upl-1');

    expect(captureRegion).toHaveBeenCalledWith({ x: 120, y: 80, width: 640, height: 480 });
    expect(run).toHaveBeenNthCalledWith(1, 'design_library_assets', expect.objectContaining({
      action: 'begin', purpose: 'gallery-preview', mediaType: 'image/png', originalChunks: 1,
    }));
    expect(run).toHaveBeenNthCalledWith(2, 'design_library_assets', expect.objectContaining({
      action: 'chunk', uploadId: 'upl-1', role: 'original', index: 0,
    }));
    expect(run).toHaveBeenNthCalledWith(3, 'design_library_assets', {
      action: 'complete', uploadId: 'upl-1',
    });
  });

  it('fails clearly when the host has no capture capability', async () => {
    const tools = { run: vi.fn() } as unknown as AppTools;
    await expect(captureGalleryPreview(tools, document.createElement('div'))).rejects.toThrow(
      'cannot capture Gallery previews',
    );
  });
});
