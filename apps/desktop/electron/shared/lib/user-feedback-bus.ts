/**
 * Local wrapper for the shared user-feedback EventEmitter singleton.
 *
 * The singleton key itself is now owned by `@sero-ai/common`; this wrapper keeps
 * Electron main/preload code on a stable local module without importing plugin
 * package code into the host boundary.
 */

import { EventEmitter } from 'events';
import { getGlobalSingleton, USER_FEEDBACK_BUS_KEY } from '@sero-ai/common';

export function getUserFeedbackBus(): EventEmitter {
  return getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(50);
    return bus;
  });
}
