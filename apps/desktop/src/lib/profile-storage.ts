/**
 * Profile-scoped localStorage/sessionStorage helpers.
 *
 * Prefixes all keys with the active profile ID to prevent cross-profile
 * contamination. Falls back to un-prefixed keys if no profile is loaded
 * (graceful degradation during startup).
 *
 * The profile ID is loaded once from the IPC bridge and cached.
 */

let _profileId: string | null = null;
let _profileIdLoaded = false;

/**
 * Set the active profile ID. Called once during startup after profile
 * hydration completes. All subsequent storage calls use this prefix.
 */
export function setStorageProfileId(id: string | null): void {
  _profileId = id;
  _profileIdLoaded = true;
}

/** Get the current profile ID (may be null before hydration). */
export function getStorageProfileId(): string | null {
  return _profileId;
}

/** Build a profile-scoped key. */
function scopedKey(key: string): string {
  if (_profileId) {
    return `sero:p:${_profileId}:${key}`;
  }
  // Fallback: un-scoped (legacy or pre-hydration)
  return key;
}

// ── localStorage wrappers ─────────────────────────────────────

export function getLocalItem(key: string): string | null {
  try {
    // Try scoped key first
    const scoped = scopedKey(key);
    const value = localStorage.getItem(scoped);
    if (value !== null) return value;

    // Fallback: read un-scoped key (migration from pre-profile era)
    if (_profileId) {
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        // Migrate: write to scoped key, remove legacy
        localStorage.setItem(scoped, legacy);
        localStorage.removeItem(key);
        return legacy;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function setLocalItem(key: string, value: string): void {
  try {
    localStorage.setItem(scopedKey(key), value);
  } catch { /* ignore */ }
}

export function removeLocalItem(key: string): void {
  try {
    localStorage.removeItem(scopedKey(key));
  } catch { /* ignore */ }
}

// ── sessionStorage wrappers ───────────────────────────────────

export function getSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(scopedKey(key));
  } catch {
    return null;
  }
}

export function setSessionItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(scopedKey(key), value);
  } catch { /* ignore */ }
}
