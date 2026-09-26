import { useCallback, useEffect, useState } from 'react';

/**
 * Unsaved edits for one config file: the draft text, its JSON parse error,
 * and the save/reload/reset actions. The draft and the sensitive-file unlock
 * reset when the selected config changes.
 */
export function useConfigDraft({
  configKey,
  content,
  isJsonFile,
  save,
  reload,
}: {
  configKey: string;
  content: string | null;
  isJsonFile: boolean;
  save: (value: string) => Promise<unknown>;
  reload: () => Promise<unknown>;
}) {
  const [editContent, setEditContent] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);

  // Reset edit state AND re-lock sensitive files when switching configs
  useEffect(() => {
    setEditContent(null);
    setParseError(null);
    setSensitiveUnlocked(false);
  }, [configKey]);

  const handleEdit = useCallback((value: string) => {
    setEditContent(value);
    // Validate JSON (skip for non-JSON files like .env)
    if (isJsonFile) {
      try {
        JSON.parse(value);
        setParseError(null);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    } else {
      setParseError(null);
    }
  }, [isJsonFile]);

  const handleSave = useCallback(async () => {
    if (!editContent || parseError) return;
    await save(editContent);
    setEditContent(null);
  }, [editContent, parseError, save]);

  const handleReload = useCallback(async () => {
    setEditContent(null);
    setParseError(null);
    await reload();
  }, [reload]);

  const handleReset = useCallback(() => {
    setEditContent(null);
    setParseError(null);
  }, []);

  return {
    displayContent: editContent ?? content,
    hasChanges: editContent !== null && editContent !== content,
    parseError,
    sensitiveUnlocked,
    setSensitiveUnlocked,
    handleEdit,
    handleSave,
    handleReload,
    handleReset,
  };
}
