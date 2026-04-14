import { useCallback, useEffect, useState } from 'react';
import type { ConfigFile } from '../../shared/types';
import { CONFIG_FILES } from '../../shared/types';
import { getSero } from './host';

export function useConfigFile(profilePath: string | null, configKey: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const configFile = configKey
    ? CONFIG_FILES.find((candidate) => candidate.key === configKey) ?? null
    : null;

  const filePath = profilePath && configFile
    ? resolveConfigPath(profilePath, configFile)
    : null;

  const isTextFile = configFile ? !configFile.relativePath.endsWith('.json') : false;

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const sero = getSero();
        if (isTextFile) {
          const text = await sero.appState.readText(filePath);
          if (!cancelled) {
            setContent(text);
          }
          return;
        }

        const data = await sero.appState.read(filePath);
        if (!cancelled) {
          setContent(data !== null ? JSON.stringify(data, null, 2) : null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read file');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, isTextFile]);

  const save = useCallback(async (newContent: string) => {
    if (!filePath) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isTextFile) {
        throw new Error('Saving text files is not yet supported');
      }

      const parsed = JSON.parse(newContent);
      await getSero().appState.write(filePath, parsed);
      setContent(newContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [filePath, isTextFile]);

  const reload = useCallback(async () => {
    if (!filePath) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const sero = getSero();
      if (isTextFile) {
        const text = await sero.appState.readText(filePath);
        setContent(text);
        return;
      }

      const data = await sero.appState.read(filePath);
      setContent(data !== null ? JSON.stringify(data, null, 2) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload');
    } finally {
      setLoading(false);
    }
  }, [filePath, isTextFile]);

  return { content, loading, error, saving, configFile, save, reload };
}

function resolveConfigPath(profilePath: string, configFile: ConfigFile): string {
  if (configFile.relativePath.startsWith('../')) {
    const parent = profilePath.replace(/\/[^/]+\/?$/, '');
    return `${parent}/${configFile.relativePath.replace('../', '')}`;
  }

  return `${profilePath}/${configFile.relativePath}`;
}
