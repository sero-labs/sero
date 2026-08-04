import { refreshModelAvailability } from '@electron/ipc/agent/core/model-availability-refresh';

const REFRESH_TIMEOUT_MS = 15_000;
let refreshQueue: Promise<void> = Promise.resolve();

export function refreshModelAvailabilityAfterCredentialChange(
  providerId: string,
): Promise<void> {
  const refresh = refreshQueue.then(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      await refreshModelAvailability({
        allowNetwork: true,
        force: true,
        signal: controller.signal,
      });
    } catch (error) {
      console.warn(
        `[auth] Credentials changed for ${providerId} but model refresh failed:`,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  });
  refreshQueue = refresh;
  return refresh;
}
