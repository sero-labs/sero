import type { MediaCapability, MediaModelOptions } from '../../shared/media';
import { MEDIA_CAPABILITIES } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { MediaSettings } from '../../shared/settings';
import { updateState } from '../../shared/state-io';
import { modelOptions, type MediaProvider } from './contract';

/**
 * What each capability's model accepts, published for the UI (D7).
 *
 * The dialog has to offer a clip length, and until now it offered a plausible
 * one: 4 seconds, on a model that takes 5 or 10 and rejects everything else. The
 * request never reached the provider's queue, so it cost nothing — but it also
 * never produced anything, which is the same as broken.
 *
 * The runtime is the only writer of state, so this is where it goes. It is a
 * cache, not a record: every field is optional, a refresh that fails leaves what
 * was there, and nothing downstream may treat an absent entry as "no options
 * exist". The provider is still the authority — this only stops the UI offering
 * choices that were never going to work.
 */

export type MediaOptionsByCapability = Partial<Record<MediaCapability, MediaModelOptions>>;

/**
 * Ask the provider about each capability's model and publish the answers.
 *
 * Best effort, and deliberately not awaited by anything that generates: a slow
 * or unreachable schema endpoint must not hold up the first video of the
 * session. The generation path settles against the provider directly, so it is
 * correct whether this ever ran or not.
 */
export async function refreshMediaOptions(
  paths: DesignLibraryPaths,
  provider: MediaProvider,
  signal?: AbortSignal,
): Promise<MediaOptionsByCapability> {
  const entries = await Promise.all(
    MEDIA_CAPABILITIES.map(async (capability) => {
      const model = provider.defaultModel(capability);
      const options = await modelOptions(provider, capability, model, signal);
      return [capability, options] as const;
    }),
  );

  // An empty answer is dropped rather than stored: "the provider could not say"
  // and "this model has no constraints" would otherwise be the same entry, and
  // the UI needs to tell them apart to decide whether to fall back.
  const published: MediaOptionsByCapability = Object.fromEntries(
    entries.filter(([, options]) => Object.keys(options).length > 0),
  );

  // Nothing to publish into a runtime that is going away, and a write landing
  // after disposal is how a restarted runtime gets written over.
  if (signal?.aborted !== true) {
    await updateState(paths, (current) => ({ ...current, mediaOptions: published }));
  }
  return published;
}

/** True when a settings change could have changed what the models accept. */
export function mediaModelsChanged(before: MediaSettings, after: MediaSettings): boolean {
  return MEDIA_CAPABILITIES.some(
    (capability) => before.models[capability] !== after.models[capability],
  );
}
