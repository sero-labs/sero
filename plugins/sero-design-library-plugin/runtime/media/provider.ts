import type { MediaCapability } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { MediaSettings } from '../../shared/settings';
import type { MediaProvider } from './contract';
import { resolveFalKey } from './credentials';
import { createFalProvider } from './providers/fal';

/**
 * The provider the plugin ships with (D6).
 *
 * One function, so nothing else has to know that fal is the answer or where the
 * key comes from.
 *
 * The key is read here, immediately before the run that will use it, rather than
 * cached on a long-lived provider: the client's credential resolver has to be
 * synchronous and a file read is not, and a provider that started its read in
 * the background would hand the first call an undefined key. One provider per
 * run is what keeps the key both fresh — a key rotated in Settings applies to
 * the next generation — and short-lived.
 */
export async function createMediaProviderForRun(
  paths: DesignLibraryPaths,
  settings: MediaSettings,
): Promise<MediaProvider> {
  const key = await resolveFalKey(paths);
  // An empty model id means "whatever the adapter defaults to", so it must not
  // reach the adapter as an override of its default with the empty string.
  const models: Partial<Record<MediaCapability, string>> = Object.fromEntries(
    Object.entries(settings.models).filter(([, model]) => model !== ''),
  );
  return createFalProvider({ credentials: () => key, models });
}
