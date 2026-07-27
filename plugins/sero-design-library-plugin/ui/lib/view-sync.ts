import type { ViewPreferences } from '../../shared/types';

/**
 * Reconciling the optimistic view with the persisted one.
 *
 * View preferences are applied locally first and persisted on a debounce, so
 * for a few hundred milliseconds the local copy is ahead. The local copy must
 * therefore win — but only while it is genuinely ahead.
 *
 * Keeping a key after state has caught up is what broke duplicate imports:
 * `select(undefined)` on leaving an item left `selectedItemId` present with the
 * value `undefined`, and spreading that over state outranked every later
 * selection the runtime made. Presence of the key, not its value, is what does
 * the damage — so a key is dropped as soon as state reports the value we asked
 * for.
 */

/**
 * JSON with object keys sorted, so two structurally equal values compare equal
 * regardless of the order their keys were built in. `filters` and `scope` are
 * rebuilt from the state file on every round trip and would otherwise never
 * match the local copy they came from — pinning those keys permanently, which
 * is the very bug this module exists to prevent.
 */
function stableJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, inner: unknown) =>
      typeof inner === 'object' && inner !== null && !Array.isArray(inner)
        ? Object.fromEntries(
            Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
          )
        : inner,
    ) ?? 'undefined'
  );
}

/**
 * A value that changes exactly when the persisted view does. Used instead of
 * object identity, which `useAppState` gives no guarantees about.
 */
export function viewSignature(view: ViewPreferences): string {
  return stableJson(view);
}

/** The optimistic keys state has not caught up with yet. */
export function outstandingView(
  local: Partial<ViewPreferences> | null,
  persisted: ViewPreferences,
): Partial<ViewPreferences> {
  if (!local) return {};
  const entries = Object.entries(local).filter(
    ([key, value]) => stableJson(persisted[key as keyof ViewPreferences]) !== stableJson(value),
  );
  return Object.fromEntries(entries) as Partial<ViewPreferences>;
}

/** The view the UI should render: persisted state, with any in-flight edits on top. */
export function mergeView(
  local: Partial<ViewPreferences> | null,
  persisted: ViewPreferences,
): ViewPreferences {
  return { ...persisted, ...outstandingView(local, persisted) };
}
