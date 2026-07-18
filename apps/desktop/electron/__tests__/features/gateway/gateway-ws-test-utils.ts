/**
 * WebSocket helpers for gateway integration tests. Split from
 * gateway-integration.test.ts to keep it under the 500-LOC rule.
 */

import { expect } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import type { GatewayResponse } from '@electron/features/gateway/server/protocol';

export interface GatewayMessageBase {
  type: string;
}

export function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

export function waitForClose(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    ws.once('close', () => resolve());
  });
}

export function waitForMessage<T extends GatewayMessageBase>(ws: WebSocket): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(new Error('Timed out waiting for gateway message'));
    }, 2000);

    const onMessage = (data: RawData) => {
      clearTimeout(timeout);
      ws.off('error', onError);
      resolve(JSON.parse(data.toString()) as T);
    };

    const onError = (error: Error) => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      reject(error);
    };

    ws.once('message', onMessage);
    ws.once('error', onError);
  });
}

export async function sendRequest<T extends GatewayMessageBase>(
  ws: WebSocket,
  request: Record<string, unknown>,
): Promise<T> {
  const responsePromise = waitForMessage<T>(ws);
  ws.send(JSON.stringify(request));
  return responsePromise;
}

export async function connectClient(port: number, token: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await waitForOpen(ws);

  const response = await sendRequest<GatewayResponse>(ws, {
    type: 'connect',
    token,
    clientType: 'web',
    clientId: `test-${Date.now()}`,
  });

  expect(response).toEqual({ type: 'ok', requestType: 'connect' });
  return ws;
}
