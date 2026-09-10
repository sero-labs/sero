import { queueModelAvailabilityRefresh } from '@electron/ipc/agent/core/model-availability-refresh';

/**
 * Refresh model availability after a credential change.
 *
 * The credential flow must not fail when model reconciliation errors, so this
 * only logs. The shared queue applies the offline guard and the timeout, and
 * serializes this call against the background catalog refresh.
 */
export async function refreshModelAvailabilityAfterCredentialChange(
  providerId: string,
): Promise<void> {
  try {
    await queueModelAvailabilityRefresh({ force: true });
  } catch (error) {
    console.warn(
      `[auth] Credentials changed for ${providerId} but model refresh failed:`,
      error,
    );
  }
}
