import type { AppToolResult } from '@sero/common';
import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useMemo, useState } from 'react';

import type { EditableKanbanSettingKey } from '../../shared/settings-descriptor';
import type { ReviewMode } from '../../shared/types';

export interface KanbanSettingsActionResult {
  ok: boolean;
  message: string;
}

type EditableKanbanSettingValue = boolean | ReviewMode;

function getToolMessage(result: AppToolResult): string {
  if (result.text.trim()) {
    return result.text;
  }

  const textBlock = result.content.find((block): block is Extract<AppToolResult['content'][number], { type: 'text' }> => block.type === 'text');
  return textBlock?.text ?? 'Kanban action completed.';
}

function stringifySettingValue(value: EditableKanbanSettingValue): string {
  return typeof value === 'boolean' ? String(value) : value;
}

function addPendingSetting(
  pending: ReadonlySet<EditableKanbanSettingKey>,
  setting: EditableKanbanSettingKey,
): ReadonlySet<EditableKanbanSettingKey> {
  const next = new Set(pending);
  next.add(setting);
  return next;
}

function removePendingSetting(
  pending: ReadonlySet<EditableKanbanSettingKey>,
  setting: EditableKanbanSettingKey,
): ReadonlySet<EditableKanbanSettingKey> {
  if (!pending.has(setting)) {
    return pending;
  }

  const next = new Set(pending);
  next.delete(setting);
  return next;
}

export function useKanbanActions() {
  const { run } = useAppTools();
  const [pendingSettings, setPendingSettings] = useState<ReadonlySet<EditableKanbanSettingKey>>(() => new Set());
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const updateSetting = useCallback(async (
    setting: EditableKanbanSettingKey,
    value: EditableKanbanSettingValue,
  ): Promise<KanbanSettingsActionResult> => {
    setSettingsError(null);
    setPendingSettings((pending) => addPendingSetting(pending, setting));

    try {
      const result = await run('kanban', {
        action: 'settings',
        setting,
        value: stringifySettingValue(value),
      });
      const message = getToolMessage(result);

      if (result.isError) {
        setSettingsError(message);
        return { ok: false, message };
      }

      return { ok: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update kanban setting.';
      setSettingsError(message);
      return { ok: false, message };
    } finally {
      setPendingSettings((pending) => removePendingSetting(pending, setting));
    }
  }, [run]);

  const clearSettingsError = useCallback(() => {
    setSettingsError(null);
  }, []);

  const isSettingPending = useCallback((setting: EditableKanbanSettingKey) => pendingSettings.has(setting), [pendingSettings]);

  return useMemo(() => ({
    updateSetting,
    isSettingPending,
    settingsError,
    clearSettingsError,
  }), [clearSettingsError, isSettingPending, settingsError, updateSetting]);
}
