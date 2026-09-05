/**
 * Request validation — turns untrusted JSON from a client into a typed
 * `GatewayRequest`, or null. Split from `protocol.ts`, which holds the
 * types, to keep both under the 500 LOC rule.
 *
 * Every field is read explicitly. Nothing is cast through from the wire.
 */

import type {
  GatewayConnectRequest,
  GatewayPromptRequest,
  GatewayRequest,
} from './protocol';

/**
 * Every request type the gateway will look at. A type absent here is
 * rejected before routing, so a new request must be added in both
 * places. `request-validation.test.ts` fails when the two drift.
 */
export const VALID_REQUEST_TYPES = new Set<GatewayRequest['type']>([
  'connect',
  'prompt',
  'steer',
  'abort',
  'status',
  'list_workspaces',
  'list_sessions',
  'search_sessions',
  'get_usage',
  'answer_choice',
  'list_notifications',
  'mark_notifications_read',
  'dismiss_notifications',
  'clear_read_notifications',
  'create_session',
  'delete_session',
  'get_session_model',
  'set_session_model',
  'set_session_thinking',
  'list_files',
  'read_file',
  'file_tree_watch',
  'file_tree_unwatch',
  'list_artifacts',
  'get_artifact',
  'create_web_token',
  'list_web_tokens',
  'revoke_web_token',
  'get_session_history',
  'list_dev_servers',
  'create_devserver_ticket',
  'voice_status',
  'voice_transcribe',
  'git_status',
  'git_diff',
  'git_commit',
  'upload_file',
  'list_remote_widgets',
  'app_state_get',
  'app_state_set',
  'app_state_watch',
  'app_state_unwatch',
  'push_status',
  'push_subscribe',
  'push_unsubscribe',
]);

const VALID_CLIENT_TYPES = new Set<GatewayConnectRequest['clientType']>(['web', 'discord', 'cli']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A required array of non-empty strings, or null when it is anything else. */
function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) return null;
    strings.push(item);
  }
  return strings;
}

function readOptionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined | null {
  const value = obj[key];
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? value : null;
}

function readOptionalNumber(obj: Record<string, unknown>, key: string): number | undefined | null {
  const value = obj[key];
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined | null {
  const value = obj[key];
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

function readOptionalFiniteNumber(obj: Record<string, unknown>, key: string): number | undefined | null {
  const value = obj[key];
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPromptImages(value: unknown): GatewayPromptRequest['images'] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const images: NonNullable<GatewayPromptRequest['images']> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const data = readRequiredString(entry, 'data');
    const mimeType = readRequiredString(entry, 'mimeType');
    if (!data || !mimeType) return null;
    images.push({ data, mimeType });
  }
  return images;
}

function readWorkspaceIds(
  obj: Record<string, unknown>,
): { ok: true; workspaceIds: string[] | null } | { ok: false } {
  const value = obj.workspaceIds;
  if (value === null) {
    return { ok: true, workspaceIds: null };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false };
  }

  const workspaceIds: string[] = [];
  for (const workspaceId of value) {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      return { ok: false };
    }
    workspaceIds.push(workspaceId);
  }
  return { ok: true, workspaceIds };
}

export function validateRequest(data: unknown): GatewayRequest | null {
  if (!isRecord(data)) return null;
  if (typeof data.type !== 'string' || !VALID_REQUEST_TYPES.has(data.type as GatewayRequest['type'])) {
    return null;
  }

  const requestId = readOptionalString(data, 'requestId');
  if (requestId === null) return null;

  const inner = validateRequestBody(data);
  if (!inner) return null;

  return requestId === undefined
    ? (inner as GatewayRequest)
    : ({ ...inner, requestId } as GatewayRequest);
}

function validateRequestBody(data: Record<string, unknown>): GatewayRequest | null {
  switch (data.type) {
    case 'connect': {
      const token = readRequiredString(data, 'token');
      const clientType = readRequiredString(data, 'clientType');
      const clientId = readOptionalString(data, 'clientId');
      if (!token || !clientType || !VALID_CLIENT_TYPES.has(clientType as GatewayConnectRequest['clientType'])) {
        return null;
      }
      if (clientId === null) return null;
      return { type: 'connect', token, clientType: clientType as GatewayConnectRequest['clientType'], clientId };
    }

    case 'prompt': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      const text = readOptionalString(data, 'text');
      const idempotencyKey = readOptionalString(data, 'idempotencyKey');
      const images = readPromptImages(data.images);
      if (!workspaceId || !sessionId || text === null || text === undefined || idempotencyKey === null || images === null) {
        return null;
      }
      return { type: 'prompt', workspaceId, sessionId, text, images, idempotencyKey };
    }

    case 'steer': {
      const sessionId = readRequiredString(data, 'sessionId');
      const text = readOptionalString(data, 'text');
      if (!sessionId || text === null || text === undefined) return null;
      return { type: 'steer', sessionId, text };
    }

    case 'abort': {
      const sessionId = readRequiredString(data, 'sessionId');
      return sessionId ? { type: 'abort', sessionId } : null;
    }

    case 'status': {
      const sessionId = readOptionalString(data, 'sessionId');
      return sessionId === null ? null : { type: 'status', sessionId };
    }

    case 'list_workspaces':
      return { type: 'list_workspaces' };

    case 'list_sessions': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      return workspaceId ? { type: 'list_sessions', workspaceId } : null;
    }

    case 'search_sessions': {
      const query = readRequiredString(data, 'query');
      const limit = readOptionalNumber(data, 'limit');
      if (!query || limit === null) return null;
      return { type: 'search_sessions', query, limit };
    }

    case 'get_usage':
      return { type: 'get_usage' };

    case 'answer_choice': {
      const id = readRequiredString(data, 'id');
      const optionId = readRequiredString(data, 'optionId');
      if (!id || !optionId) return null;
      return { type: 'answer_choice', id, optionId };
    }

    case 'list_notifications': {
      const since = readOptionalNumber(data, 'since');
      const limit = readOptionalNumber(data, 'limit');
      if (since === null || limit === null) return null;
      return { type: 'list_notifications', since, limit };
    }

    case 'mark_notifications_read': {
      const ids = readStringArray(data.ids);
      if (!ids || ids.length === 0) return null;
      return { type: 'mark_notifications_read', ids };
    }

    case 'dismiss_notifications': {
      const ids = readStringArray(data.ids);
      if (!ids || ids.length === 0) return null;
      return { type: 'dismiss_notifications', ids };
    }

    case 'clear_read_notifications':
      return { type: 'clear_read_notifications' };

    case 'list_remote_widgets': {
      const workspaceId = readOptionalString(data, 'workspaceId');
      return workspaceId === null ? null : { type: 'list_remote_widgets', workspaceId };
    }

    case 'app_state_get':
    case 'app_state_watch':
    case 'app_state_unwatch': {
      const key = readRequiredString(data, 'key');
      return key ? { type: data.type, key } : null;
    }

    case 'app_state_set': {
      const key = readRequiredString(data, 'key');
      if (!key || !('data' in data)) return null;
      // `expectedEtag` is optional, and null is a real value: it means
      // the writer believes the file does not exist yet.
      const etag = data.expectedEtag;
      if (etag !== undefined && etag !== null && typeof etag !== 'string') return null;
      return {
        type: 'app_state_set',
        key,
        data: data.data,
        ...(etag === undefined ? {} : { expectedEtag: etag }),
      };
    }

    case 'push_status':
      return { type: 'push_status' };

    case 'push_subscribe': {
      const endpoint = readRequiredString(data, 'endpoint');
      const p256dh = readRequiredString(data, 'p256dh');
      const auth = readRequiredString(data, 'auth');
      if (!endpoint || !p256dh || !auth) return null;
      return { type: 'push_subscribe', endpoint, p256dh, auth };
    }

    case 'push_unsubscribe': {
      const endpoint = readRequiredString(data, 'endpoint');
      return endpoint ? { type: 'push_unsubscribe', endpoint } : null;
    }

    case 'upload_file': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const requestPath = readRequiredString(data, 'path');
      const contentBase64 = readRequiredString(data, 'contentBase64');
      if (!workspaceId || !requestPath || !contentBase64) return null;
      return { type: 'upload_file', workspaceId, path: requestPath, contentBase64 };
    }

    case 'git_status': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      return workspaceId ? { type: 'git_status', workspaceId } : null;
    }

    case 'git_diff': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const requestPath = readRequiredString(data, 'path');
      const staged = readOptionalBoolean(data, 'staged');
      if (!workspaceId || !requestPath || staged === null) return null;
      return { type: 'git_diff', workspaceId, path: requestPath, staged };
    }

    case 'git_commit': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const message = readRequiredString(data, 'message');
      const paths = readStringArray(data.paths);
      if (!workspaceId || !message || !paths || paths.length === 0) return null;
      return { type: 'git_commit', workspaceId, message, paths };
    }

    case 'create_session': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const name = readOptionalString(data, 'name');
      if (!workspaceId || name === null) return null;
      return { type: 'create_session', workspaceId, name };
    }

    case 'delete_session': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      return workspaceId && sessionId
        ? { type: 'delete_session', workspaceId, sessionId }
        : null;
    }

    case 'get_session_model': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      return workspaceId && sessionId
        ? { type: 'get_session_model', workspaceId, sessionId }
        : null;
    }

    case 'set_session_model': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      const provider = readRequiredString(data, 'provider');
      const modelId = readRequiredString(data, 'modelId');
      return workspaceId && sessionId && provider && modelId
        ? { type: 'set_session_model', workspaceId, sessionId, provider, modelId }
        : null;
    }

    case 'set_session_thinking': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      // The level itself is checked by the host, which owns the list.
      const level = readRequiredString(data, 'level');
      return workspaceId && sessionId && level
        ? { type: 'set_session_thinking', workspaceId, sessionId, level }
        : null;
    }

    case 'list_files': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const requestPath = readRequiredString(data, 'path');
      return workspaceId && requestPath
        ? { type: 'list_files', workspaceId, path: requestPath }
        : null;
    }

    case 'read_file': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const requestPath = readRequiredString(data, 'path');
      return workspaceId && requestPath
        ? { type: 'read_file', workspaceId, path: requestPath }
        : null;
    }

    case 'file_tree_watch':
    case 'file_tree_unwatch': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      return workspaceId ? { type: data.type, workspaceId } : null;
    }

    case 'list_artifacts': {
      const sessionId = readRequiredString(data, 'sessionId');
      return sessionId ? { type: 'list_artifacts', sessionId } : null;
    }

    case 'get_artifact': {
      const artifactId = readRequiredString(data, 'artifactId');
      return artifactId ? { type: 'get_artifact', artifactId } : null;
    }

    case 'create_web_token': {
      const workspaceScope = readWorkspaceIds(data);
      const label = readOptionalString(data, 'label');
      const expiryDays = readOptionalFiniteNumber(data, 'expiryDays');
      if (!workspaceScope.ok || label === null || expiryDays === null) return null;
      if (expiryDays !== undefined && (!Number.isInteger(expiryDays) || expiryDays <= 0)) {
        return null;
      }
      return { type: 'create_web_token', workspaceIds: workspaceScope.workspaceIds, label, expiryDays };
    }

    case 'list_web_tokens':
      return { type: 'list_web_tokens' };

    case 'revoke_web_token': {
      const tokenId = readRequiredString(data, 'tokenId');
      return tokenId ? { type: 'revoke_web_token', tokenId } : null;
    }

    case 'get_session_history': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      return workspaceId && sessionId
        ? { type: 'get_session_history', workspaceId, sessionId }
        : null;
    }

    case 'list_dev_servers': {
      const workspaceId = readOptionalString(data, 'workspaceId');
      if (workspaceId === null) return null;
      return workspaceId
        ? { type: 'list_dev_servers', workspaceId }
        : { type: 'list_dev_servers' };
    }

    case 'create_devserver_ticket': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const port = data.port;
      if (
        !workspaceId ||
        typeof port !== 'number' ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        return null;
      }
      return { type: 'create_devserver_ticket', workspaceId, port };
    }

    case 'voice_status':
      return { type: 'voice_status' };

    case 'voice_transcribe': {
      const audioDataUrl = readRequiredString(data, 'audioDataUrl');
      const mimeType = readOptionalString(data, 'mimeType');
      if (!audioDataUrl || mimeType === null) return null;
      // Reject obviously oversized payloads early. The OpenAI transcription
      // helper enforces the 25 MB decoded ceiling (~33.4 MB base64); this
      // 35 MB cap stays comfortably under the gateway's 36 MB WebSocket
      // payload limit and short-circuits clearly bogus inputs.
      if (audioDataUrl.length > 35 * 1024 * 1024) return null;
      return { type: 'voice_transcribe', audioDataUrl, mimeType };
    }
  }

  return null;
}
