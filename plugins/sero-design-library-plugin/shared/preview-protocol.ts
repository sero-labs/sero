/**
 * The only messages that cross the preview boundary.
 *
 * Host → frame carries a declared tweak id and a schema-valid value, nothing
 * else. There is deliberately no message that can carry a selector, CSS text
 * or JavaScript.
 */

import type { TweakValue } from './tweak-types';

export const PREVIEW_CHANNEL = 'sero-design-library-preview';

export interface TweakValueMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'tweak-value';
  id: string;
  value: TweakValue;
}

export interface TweakResetMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'tweak-reset';
  /** Omitted to reset every control. */
  id?: string;
}

export type PreviewHostMessage = TweakValueMessage | TweakResetMessage;

export type PreviewBlockedCapability =
  | 'network'
  | 'storage'
  | 'navigation'
  | 'popup'
  | 'worker'
  | 'dependency';

export interface PreviewReadyMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'ready';
  controlIds: string[];
}

export interface PreviewBlockedMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'blocked';
  capability: PreviewBlockedCapability;
  detail: string;
}

export interface PreviewErrorMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'error';
  message: string;
}

export interface PreviewRejectedMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'rejected';
  id: string;
  reason: string;
}

export type PreviewFrameMessage =
  | PreviewReadyMessage
  | PreviewBlockedMessage
  | PreviewErrorMessage
  | PreviewRejectedMessage;

export function isPreviewFrameMessage(value: unknown): value is PreviewFrameMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message.channel !== PREVIEW_CHANNEL) return false;
  return (
    message.type === 'ready'
    || message.type === 'blocked'
    || message.type === 'error'
    || message.type === 'rejected'
  );
}

export const BLOCKED_CAPABILITY_LABELS: Record<PreviewBlockedCapability, string> = {
  network: 'Network access',
  storage: 'Cookies and persistent storage',
  navigation: 'Navigating the Sero window',
  popup: 'Opening windows',
  worker: 'Background workers',
  dependency: 'Dependencies outside the approved bundle',
};
