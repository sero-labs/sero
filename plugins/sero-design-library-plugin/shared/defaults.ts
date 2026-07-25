import type { DesignLibraryProfileSettings } from './types';

export const DESIGN_LIBRARY_SCHEMA_VERSION = 1;
export const MAX_DESIGN_REFERENCES = 6;

export const DEFAULT_DESIGN_LIBRARY_SETTINGS: DesignLibraryProfileSettings = {
  variantCount: 3,
  revisionBehaviour: 'replace',
};
