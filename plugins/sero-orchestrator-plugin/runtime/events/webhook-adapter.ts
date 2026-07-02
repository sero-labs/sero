/**
 * Local webhook event source (`webhook:<name>`, spec 12 Phase 3).
 *
 * One loopback-only HTTP listener serves every hook: `POST /hooks/<name>`
 * fires `webhook:<name>` with the JSON body as payload. The listener exists
 * only while at least one active loop subscribes to a webhook source. Exposing
 * it beyond 127.0.0.1 (e.g. via Tailscale) is the user's choice and out of
 * scope here.
 *
 * Durable config lives in the adapter state file (`events/webhook.json`):
 * the port (persisted after first listen so hook URLs stay stable across
 * restarts; 0 = pick an ephemeral port) and optional per-hook shared secrets,
 * checked against the `x-sero-secret` header.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { OrchestratorHost } from '../host';
import type { EmitEvent, EventSourceAdapter, EventSubscription } from './types';
import { readAdapterState, writeAdapterState } from './adapter-state';

const HOOK_PATTERN = /^\/hooks\/([a-z][a-z0-9-]*)$/;
const SECRET_HEADER = 'x-sero-secret';
const MAX_BODY_BYTES = 256 * 1024;

export interface WebhookAdapterState {
  /** Listening port; persisted after first successful listen. 0 ⇒ ephemeral. */
  port: number;
  /** Optional per-hook shared secrets, keyed by hook name. */
  secrets?: Record<string, string>;
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

export function createWebhookAdapter(host: OrchestratorHost, emit: EmitEvent): EventSourceAdapter {
  let server: Server | undefined;
  let starting = false;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const match = request.method === 'POST' ? HOOK_PATTERN.exec(request.url ?? '') : null;
    if (!match) return respond(response, 404, { error: 'unknown hook — POST /hooks/<name>' });
    const hook = match[1];

    const state = await readAdapterState<WebhookAdapterState>(host, 'webhook');
    const secret = state?.secrets?.[hook];
    if (secret && request.headers[SECRET_HEADER] !== secret) {
      return respond(response, 401, { error: 'bad or missing secret' });
    }

    const raw = await readBody(request);
    if (raw === null) return respond(response, 413, { error: 'body too large' });
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
      payload = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { value: parsed };
    } catch {
      return respond(response, 400, { error: 'body must be JSON' });
    }

    await emit({
      id: host.newId('evt'),
      source: `webhook:${hook}`,
      payload,
      occurredAt: host.now(),
      summary: `Webhook "${hook}" received`,
    }).catch((error) => host.log(`webhook adapter: emit failed: ${error}`));
    respond(response, 202, { ok: true });
  };

  const start = async (): Promise<void> => {
    if (server || starting) return;
    starting = true;
    try {
      const state = await readAdapterState<WebhookAdapterState>(host, 'webhook');
      const wanted = state?.port ?? 0;
      const listener = createServer((request, response) => {
        void handle(request, response).catch((error) => {
          host.log(`webhook adapter: request failed: ${error}`);
          respond(response, 500, { error: 'internal error' });
        });
      });
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        // Loopback only — never reachable from the network by default.
        listener.listen(wanted, '127.0.0.1', resolve);
      }).catch(async (error) => {
        if (wanted === 0) throw error;
        // The persisted port is taken — fall back to an ephemeral one.
        host.log(`webhook adapter: port ${wanted} unavailable (${error}), picking a new one`);
        await new Promise<void>((resolve, reject) => {
          listener.once('error', reject);
          listener.listen(0, '127.0.0.1', resolve);
        });
      });
      const address = listener.address();
      const port = typeof address === 'object' && address ? address.port : wanted;
      await writeAdapterState<WebhookAdapterState>(host, 'webhook', { ...state, port });
      server = listener;
      host.log(`webhook adapter: listening on 127.0.0.1:${port}`);
    } catch (error) {
      host.log(`webhook adapter: could not listen: ${error}`);
    } finally {
      starting = false;
    }
  };

  const stop = (): void => {
    server?.close();
    server = undefined;
  };

  return {
    namespace: 'webhook',
    sync(subscriptions: EventSubscription[]): void {
      if (subscriptions.length > 0) void start();
      else if (server) {
        stop();
        host.log('webhook adapter: stopped (no subscribers)');
      }
    },
    dispose: stop,
  };
}
