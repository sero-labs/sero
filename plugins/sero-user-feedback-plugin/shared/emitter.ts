/**
 * Shared globalThis EventEmitter singleton for the user-feedback IPC bridge.
 *
 * The bus key itself lives in `@sero/common` so the extension and Electron host
 * cannot drift on manual string copies.
 */

import { EventEmitter } from 'node:events';
import { getGlobalSingleton, USER_FEEDBACK_BUS_KEY } from '@sero/common';

export function getUserFeedbackBus(): EventEmitter {
  return getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(50);
    return bus;
  });
}
