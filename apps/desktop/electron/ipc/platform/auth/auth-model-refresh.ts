import { refreshModelAvailability } from '@electron/ipc/agent/core/model-availability-refresh';

export async function refreshModelAvailabilityAfterCredentialChange(): Promise<void> {
  try {
    await refreshModelAvailability();
  } catch (error) {
    console.warn('[auth] Credentials changed but model refresh failed:', error);
  }
}
