import { getSeroApi } from '@sero-ai/app-runtime';
import type { WebAppRequest } from '@sero/common';

function getWebAppBridge(): NonNullable<ReturnType<typeof getSeroApi>['webApp']> {
  const webApp = getSeroApi().webApp;
  if (!webApp) {
    throw new Error('webApp bridge is unavailable');
  }
  return webApp;
}

async function runWebAction(workspaceId: string, params: WebAppRequest): Promise<void> {
  const result = await getWebAppBridge().run(workspaceId, params);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function clearHistory(workspaceId: string): Promise<void> {
  await runWebAction(workspaceId, { action: 'clear-history' });
}

export async function addBookmark(
  workspaceId: string,
  params: Extract<WebAppRequest, { action: 'add-bookmark' }>,
): Promise<void> {
  await runWebAction(workspaceId, params);
}

export async function removeBookmark(workspaceId: string, idOrUrl: string): Promise<void> {
  await runWebAction(workspaceId, { action: 'remove-bookmark', idOrUrl });
}

export async function deleteDownload(
  workspaceId: string,
  params: Omit<Extract<WebAppRequest, { action: 'delete-download' }>, 'action'>,
): Promise<void> {
  await runWebAction(workspaceId, { action: 'delete-download', ...params });
}
