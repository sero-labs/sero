/** Maximum entries for augmentation caches to prevent unbounded memory growth. */
export const MAX_AUGMENT_CACHE_KEYS = 256;

/** Add a key to a bounded Set, evicting the oldest entry when full. */
export function addBoundedSet(set: Set<string>, key: string, max: number): void {
  if (set.size >= max) {
    const oldest = set.keys().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(key);
}

/** Per-session graph auto-context state. */
export interface GraphContextState {
  graphExists: boolean;
  graphPath: string;
  reportPath: string;
  reportContextInjected: boolean;
  augmentHits: number;
  hookFires: number;
  augmentedCache: Set<string>;
  emptyCache: Set<string>;
}

/** Create a fresh GraphContextState. Paths are populated by syncGraphContextProjectState. */
export function createGraphContextState(): GraphContextState {
  return {
    graphExists: false,
    graphPath: '',
    reportPath: '',
    reportContextInjected: false,
    augmentHits: 0,
    hookFires: 0,
    augmentedCache: new Set<string>(),
    emptyCache: new Set<string>(),
  };
}
