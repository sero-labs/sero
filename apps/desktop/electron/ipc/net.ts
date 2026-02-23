/**
 * Net proxy IPC handler.
 *
 * Proxies HTTP requests from the renderer through the main process,
 * bypassing browser CORS restrictions. Sero apps that call external
 * APIs (e.g. Starling Bank) use this instead of direct fetch().
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { ProxyFetchRequest, ProxyFetchResponse } from '../../src/types/ipc';

export function registerNetHandlers(): void {
  ipcMain.handle(
    IpcChannels.net.fetch,
    async (_event, request: ProxyFetchRequest): Promise<ProxyFetchResponse> => {
      const { url, method = 'GET', headers = {}, body } = request;

      const res = await fetch(url, {
        method,
        headers,
        body: body ?? undefined,
      });

      // Collect response headers into a plain object
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await res.text();

      return {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    },
  );
}
