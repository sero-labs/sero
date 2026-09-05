/**
 * Whether Remote Control starts with the app.
 *
 * Turning it on used to last only until the app closed, because the flag
 * lived in memory. A phone paired with a token then could not reach the
 * desktop after a restart, which reads as the token having expired.
 *
 * The flag sits beside the gateway's own token files, in the active
 * profile's settings.json, so a profile that has never been paired does
 * not open a port because another profile was.
 */

import { getSeroSettings, readSettingsResult, writeSettings } from './settings-helpers';

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Whether the saved setting asks for the gateway.
 *
 * A settings file that cannot be read means off. Opening a port to the
 * network is not the safe reading of a broken file.
 */
export function getGatewayEnabled(): boolean {
  const result = readSettingsResult();
  if (!result.ok) return false;

  const gateway = getObject(getSeroSettings(result.settings).gateway);
  return gateway.enabled === true;
}

/** Remember the choice for the next launch. */
export function setGatewayEnabled(enabled: boolean): void {
  const result = readSettingsResult();
  // A malformed settings file is not worth overwriting from here: doing
  // so would throw away everything else in it.
  if (!result.ok) {
    console.warn('[gateway] Could not save the enabled flag:', result.error.message);
    return;
  }

  const settings = result.settings;
  const sero = getSeroSettings(settings);
  const gateway = getObject(sero.gateway);

  try {
    writeSettings({
      ...settings,
      sero: { ...sero, gateway: { ...gateway, enabled } },
    });
  } catch (err) {
    // The gateway still runs for this session; only the memory of it is lost.
    console.warn('[gateway] Could not save the enabled flag:', err);
  }
}

/**
 * Should the gateway come up with the app?
 *
 * Two ways to ask for it. `SERO_GATEWAY=1` is an instruction for this
 * launch and wins outright, which is what the docs promise. Otherwise
 * the saved setting decides, so turning Remote Control on in the app
 * survives a restart and a paired phone keeps working.
 */
export function shouldAutoStartGateway(): boolean {
  return process.env.SERO_GATEWAY === '1' || getGatewayEnabled();
}
