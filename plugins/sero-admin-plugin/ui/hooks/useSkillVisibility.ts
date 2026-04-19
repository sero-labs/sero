import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDisabledModelSkills } from '@sero-ai/common';
import { getSero, type AvailableSkillInfo } from './host';

interface SkillVisibilityRow extends AvailableSkillInfo {
  hiddenByUser: boolean;
  lockedHidden: boolean;
  visibleToModel: boolean;
}

interface UseSkillVisibilityResult {
  skills: SkillVisibilityRow[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  setSkillEnabled: (name: string, enabled: boolean) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneSet(values: Set<string>): Set<string> {
  return new Set(values);
}

function sortSkills(skills: SkillVisibilityRow[]): SkillVisibilityRow[] {
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function useSkillVisibility(profilePath: string | null): UseSkillVisibilityResult {
  const [availableSkills, setAvailableSkills] = useState<AvailableSkillInfo[]>([]);
  const [disabledSkillNames, setDisabledSkillNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settingsPath = profilePath ? `${profilePath}/agent/settings.json` : null;
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);

  const load = useCallback(async () => {
    if (!settingsPath) {
      setAvailableSkills([]);
      setDisabledSkillNames(new Set());
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const sero = getSero();
      const [settingsResult, skills] = await Promise.all([
        sero.appState.read(settingsPath),
        sero.skills.listAvailableSkills(),
      ]);

      const settings = isRecord(settingsResult) ? settingsResult : {};
      setAvailableSkills(skills);
      setDisabledSkillNames(new Set(getDisabledModelSkills(settings)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill visibility');
    } finally {
      setLoading(false);
    }
  }, [settingsPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistDisabledSkills = useCallback((nextDisabledSkillNames: Set<string>) => {
    if (!settingsPath) return;

    const disabledSkillSnapshot = [...nextDisabledSkillNames];
    pendingSaveCountRef.current += 1;
    setSaving(true);
    setError(null);

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const sero = getSero();
        await sero.skills.setDisabledModelSkills(disabledSkillSnapshot);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to save skill visibility');
      })
      .finally(() => {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
        if (pendingSaveCountRef.current === 0) {
          setSaving(false);
        }
      });
  }, [settingsPath]);

  const setSkillEnabled = useCallback((name: string, enabled: boolean) => {
    setDisabledSkillNames((current) => {
      const next = cloneSet(current);
      if (enabled) next.delete(name);
      else next.add(name);
      persistDisabledSkills(next);
      return next;
    });
  }, [persistDisabledSkills]);

  const skills = useMemo(() => sortSkills(
    availableSkills.map((skill) => {
      const lockedHidden = skill.disableModelInvocation;
      const hiddenByUser = disabledSkillNames.has(skill.name);
      return {
        ...skill,
        hiddenByUser,
        lockedHidden,
        visibleToModel: !lockedHidden && !hiddenByUser,
      };
    }),
  ), [availableSkills, disabledSkillNames]);

  return {
    skills,
    loading,
    saving,
    error,
    setSkillEnabled,
  };
}

export type { SkillVisibilityRow };
