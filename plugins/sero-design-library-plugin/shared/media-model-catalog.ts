import type { MediaCapability } from './media';

/**
 * One model exposed to settings.
 *
 * The ID is opaque outside the provider adapter. A provider can replace fal.ai
 * without changing the settings tool or UI.
 */
export interface MediaModelChoice {
  id: string;
  label: string;
  /** Provider label used to group choices. Its source is adapter-owned. */
  provider: string;
}

export type MediaModelChoices = Record<MediaCapability, MediaModelChoice[]>;

/** Provider-neutral model discovery used by the settings tool. */
export interface MediaModelCatalog {
  list(signal?: AbortSignal): Promise<MediaModelChoices>;
}
