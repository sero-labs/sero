import { protocol } from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { SERO_AGENT_DIR } from '@electron/platform/env';

export type DashboardBackgroundMimeType = 'image/png' | 'image/jpeg';

const DASHBOARD_BACKGROUND_PATHS: Record<DashboardBackgroundMimeType, string> = {
  'image/png': path.join(SERO_AGENT_DIR, 'dashboard-background.png'),
  'image/jpeg': path.join(SERO_AGENT_DIR, 'dashboard-background.jpg'),
};

const DASHBOARD_BACKGROUND_MIME_BY_PATH: Record<string, DashboardBackgroundMimeType> = {
  '/background.png': 'image/png',
  '/background.jpg': 'image/jpeg',
};

export function getDashboardBackgroundPath(mimeType: DashboardBackgroundMimeType): string {
  return DASHBOARD_BACKGROUND_PATHS[mimeType];
}

export function getOtherDashboardBackgroundPath(mimeType: DashboardBackgroundMimeType): string {
  return mimeType === 'image/png'
    ? DASHBOARD_BACKGROUND_PATHS['image/jpeg']
    : DASHBOARD_BACKGROUND_PATHS['image/png'];
}

export function getDashboardBackgroundUrl(
  mimeType: DashboardBackgroundMimeType,
  version: string,
): string {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  return `sero-media://dashboard/background.${extension}?v=${encodeURIComponent(version)}`;
}

export function setupHostMediaProtocol(): void {
  protocol.handle('sero-media', async (request) => {
    const url = new URL(request.url);
    const mimeType = url.hostname === 'dashboard'
      ? DASHBOARD_BACKGROUND_MIME_BY_PATH[url.pathname]
      : undefined;
    if (!mimeType) {
      return new Response('Not found', { status: 404 });
    }

    const filePath = DASHBOARD_BACKGROUND_PATHS[mimeType];
    if (!existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    const data = await fs.readFile(filePath);

    return new Response(new Uint8Array(data), {
      headers: {
        'cache-control': 'private, max-age=31536000, immutable',
        'content-type': mimeType,
      },
    });
  });
}
