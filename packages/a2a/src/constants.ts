import { A2A_PROTOCOL_VERSION, A2A_VERSION_HEADER } from '@a2a-js/sdk';

export const SERO_A2A_VERSION = '1.0' as const;
export const SERO_CONTROL_VERSION = '1' as const;
export const SERO_CONTROL_VERSION_HEADER = 'Sero-Control-Version' as const;
export const SERO_EXTENSION_URI = 'https://sero.dev/a2a/control-plane/v1' as const;
export const SERO_CONTROL_PATH = '/sero/v1' as const;
export const SERO_BEARER_SCHEME = 'seroBearer' as const;
export const SERO_QUEUE_MODE_METADATA_KEY = 'sero:queue-mode' as const;

// Keep the local posture tied to the canonical SDK constant at compile time.
const sdkVersion: typeof SERO_A2A_VERSION = A2A_PROTOCOL_VERSION;
export const A2A_VERSION = sdkVersion;
export { A2A_VERSION_HEADER };

export const CONTROL_OPERATION_NAMES = [
  'enrol',
  'mintEnrolmentCode',
  'listControllers',
  'revokeController',
  'listSessions',
  'createSession',
  'deleteSession',
  'setSessionModel',
  'setSessionApprovalMode',
  'getNodeHealth',
  'getProviders',
  'login',
  'logout',
  'setApiKey',
  'removeApiKey',
  'respondPrompt',
  'respondSelect',
  'respondManualCode',
  'cancel',
] as const;

export const CONTROL_STREAM_NAMES = ['nodeEvents', 'sessionEvents', 'authEvents'] as const;
export const SERO_A2A_OPERATION_NAMES = [
  'SendMessage',
  'SendStreamingMessage',
  'GetTask',
  'CancelTask',
  'SubscribeToTask',
] as const;

export type ControlOperationName = (typeof CONTROL_OPERATION_NAMES)[number];
export type ControlStreamName = (typeof CONTROL_STREAM_NAMES)[number];

export const controlOperationPath = (operation: ControlOperationName): string =>
  `${SERO_CONTROL_PATH}/${operation}`;

export const CONTROL_STREAM_PATHS = {
  nodeEvents: `${SERO_CONTROL_PATH}/events`,
  sessionEvents: `${SERO_CONTROL_PATH}/sessions/:contextId/events`,
  authEvents: `${SERO_CONTROL_PATH}/auth/events`,
} as const satisfies Record<ControlStreamName, string>;

export const a2aVersionHeaders = (): Record<string, typeof SERO_A2A_VERSION> => ({
  [A2A_VERSION_HEADER]: SERO_A2A_VERSION,
});

export const controlVersionHeaders = (): Record<string, typeof SERO_CONTROL_VERSION> => ({
  [SERO_CONTROL_VERSION_HEADER]: SERO_CONTROL_VERSION,
});

export function hasA2AVersion(headers: Pick<Headers, 'get'>): boolean {
  return headers.get(A2A_VERSION_HEADER) === SERO_A2A_VERSION;
}

export function hasControlVersion(headers: Pick<Headers, 'get'>): boolean {
  return headers.get(SERO_CONTROL_VERSION_HEADER) === SERO_CONTROL_VERSION;
}
