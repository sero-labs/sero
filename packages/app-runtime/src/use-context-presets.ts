/**
 * useContextPresets — loads and persists profile-level context-editor presets,
 * the same store the chat session editor uses. Lets app modules reuse a user's
 * saved contexts.
 *
 * Returns { presets, save, loading, error }.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ContextPreset } from '@sero-ai/common';
import { getSeroApi } from './sero-bridge';

export interface UseContextPresetsResult {
  presets: ContextPreset[];
  /** Persist a new full preset list and update local state. */
  save: (next: ContextPreset[]) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useContextPresets(): UseContextPresetsResult {
  const [presets, setPresets] = useState<ContextPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getSeroApi();
    if (!api.contextPresets) {
      setError('Context presets not available in this Sero version');
      setLoading(false);
      return;
    }
    api.contextPresets
      .load()
      .then(setPresets)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load presets'))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (next: ContextPreset[]) => {
    setPresets(next);
    const api = getSeroApi();
    if (!api.contextPresets) return;
    try {
      await api.contextPresets.save(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save presets');
    }
  }, []);

  return { presets, save, loading, error };
}
