import { protocol } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import { inspectDashboardBackgroundImage } from '@electron/shared/media/dashboard-background-image';

const DASHBOARD_BACKGROUND_PATH = path.join(SERO_AGENT_DIR, 'dashboard-background.image');

export function getDashboardBackgroundPath(): string {
  return DASHBOARD_BACKGROUND_PATH;
}

export function getDashboardBackgroundUrl(version: string): string {
  return `sero-media://dashboard/background?v=${encodeURIComponent(version)}`;
}

export function setupHostMediaProtocol(): void {
  protocol.handle('sero-media', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'dashboard' || url.pathname !== '/background') {
      return new Response('Not found', { status: 404 });
    }

    let data: Buffer;
    try {
      data = await fs.readFile(DASHBOARD_BACKGROUND_PATH);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Response('Not found', { status: 404 });
      }
      throw error;
    }

    const image = inspectDashboardBackgroundImage(data);
    if (!image) return new Response('Not found', { status: 404 });

    return new Response(new Uint8Array(data), {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': image.mimeType,
      },
    });
  });
}
