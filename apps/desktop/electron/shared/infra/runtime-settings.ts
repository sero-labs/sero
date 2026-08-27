import { type SettingsManager } from '@earendil-works/pi-coding-agent';
import { subagentManager } from './singletons';
import { configureElectronFetch } from './electron-fetch';

export { pickFirstAvailableModel } from './model-selection';

/** Apply runtime-only settings that need to update live singletons. */
export function applyRuntimeSettings(
  settingsManager: ReturnType<typeof SettingsManager.create>,
): void {
  configureElectronFetch(settingsManager.getHttpIdleTimeoutMs());
  const raw = (settingsManager.getGlobalSettings() as Record<string, unknown>)?.subagent as Record<string, unknown> | undefined;

  subagentManager.updateSettings({
    maxConcurrent: typeof raw?.maxConcurrent === 'number' ? raw.maxConcurrent : undefined,
    maxTotal: typeof raw?.maxTotal === 'number' ? raw.maxTotal : undefined,
    timeoutMs: typeof raw?.timeoutMs === 'number' ? raw.timeoutMs : undefined,
    model: typeof raw?.model === 'string' ? raw.model : undefined,
    thinking: typeof raw?.thinking === 'string' ? raw.thinking : undefined,
  });
}
