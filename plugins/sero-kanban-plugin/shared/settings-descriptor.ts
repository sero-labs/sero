import type { KanbanSettings, ReviewMode } from './types';

export type EditableKanbanSettingKey = 'yoloMode' | 'yoloAutoMergePrs' | 'testingEnabled' | 'reviewMode';
export type ReadOnlyKanbanSettingKey = 'autoAdvance';
export type KanbanSettingKey = EditableKanbanSettingKey | ReadOnlyKanbanSettingKey;

interface BaseDescriptor<K extends KanbanSettingKey> {
  key: K;
  label: string;
  description: string;
}

interface ToggleDescriptor<K extends EditableKanbanSettingKey> extends BaseDescriptor<K> {
  kind: 'toggle';
}

interface SelectDescriptor<K extends EditableKanbanSettingKey, V extends string> extends BaseDescriptor<K> {
  kind: 'select';
  options: ReadonlyArray<{
    value: V;
    label: string;
  }>;
}

interface ReadOnlyDescriptor extends BaseDescriptor<ReadOnlyKanbanSettingKey> {
  kind: 'readonly';
  valueDescription: string;
}

export type KanbanSettingDescriptor =
  | ToggleDescriptor<'yoloMode'>
  | ToggleDescriptor<'yoloAutoMergePrs'>
  | ToggleDescriptor<'testingEnabled'>
  | SelectDescriptor<'reviewMode', ReviewMode>
  | ReadOnlyDescriptor;

export const KANBAN_SETTING_DESCRIPTORS: ReadonlyArray<KanbanSettingDescriptor> = [
  {
    key: 'yoloMode',
    kind: 'toggle',
    label: 'YOLO Mode',
    description: 'Auto-start, auto-approve, and auto-complete cards with no human gates.',
  },
  {
    key: 'yoloAutoMergePrs',
    kind: 'toggle',
    label: 'PR Auto-Merge',
    description: 'When YOLO mode is on, automatically queue GitHub auto-merge after PR creation.',
  },
  {
    key: 'testingEnabled',
    kind: 'toggle',
    label: 'Testing Enabled',
    description: 'Production mode keeps TDD and test generation on. Disable for prototype work.',
  },
  {
    key: 'reviewMode',
    kind: 'select',
    label: 'Review Mode',
    description: 'Full keeps the standard diff review pass. Light is only available when testing is disabled.',
    options: [
      { value: 'full', label: 'Full' },
      { value: 'light', label: 'Light' },
    ],
  },
  {
    key: 'autoAdvance',
    kind: 'readonly',
    label: 'Auto Advance',
    description: 'Host orchestration currently owns this behavior; completed phases automatically queue the next runtime-backed step.',
    valueDescription: 'Read-only runtime setting',
  },
] as const;

const EDITABLE_SETTING_NAMES = KANBAN_SETTING_DESCRIPTORS
  .filter((descriptor): descriptor is Exclude<KanbanSettingDescriptor, ReadOnlyDescriptor> => descriptor.kind !== 'readonly')
  .map((descriptor) => descriptor.key);

function getDescriptor(key: KanbanSettingKey): KanbanSettingDescriptor {
  const descriptor = KANBAN_SETTING_DESCRIPTORS.find((candidate) => candidate.key === key);
  if (!descriptor) {
    throw new Error(`Unknown kanban setting descriptor: ${key}`);
  }
  return descriptor;
}

function getReadOnlyDescriptor(key: ReadOnlyKanbanSettingKey): ReadOnlyDescriptor {
  const descriptor = getDescriptor(key);
  if (descriptor.kind !== 'readonly') {
    throw new Error(`Kanban setting ${key} is not read-only`);
  }
  return descriptor;
}

export function getEditableKanbanSettingNames(): EditableKanbanSettingKey[] {
  return [...EDITABLE_SETTING_NAMES];
}

export function describeEditableKanbanSettings(): string {
  return getEditableKanbanSettingNames().join(', ');
}

export function formatKanbanSettingsSummary(settings: KanbanSettings): string {
  return [
    '## Board Settings',
    `- yoloMode: ${settings.yoloMode} (${getDescriptor('yoloMode').description})`,
    `- yoloAutoMergePrs: ${settings.yoloAutoMergePrs} (${getDescriptor('yoloAutoMergePrs').description})`,
    `- testingEnabled: ${settings.testingEnabled} (${getDescriptor('testingEnabled').description})`,
    `- reviewMode: ${settings.reviewMode ?? 'full'} (${getDescriptor('reviewMode').description})`,
    `- autoAdvance: ${settings.autoAdvance} (${getReadOnlyDescriptor('autoAdvance').valueDescription})`,
  ].join('\n');
}

export function updateKanbanSetting(
  settings: KanbanSettings,
  setting: string,
  value?: string,
): { ok: true; message: string } | { ok: false; message: string } {
  switch (setting) {
    case 'yoloMode': {
      settings.yoloMode = value === 'true';
      if (!settings.yoloMode) {
        settings.yoloAutoMergePrs = false;
      }
      return {
        ok: true,
        message: `YOLO mode ${settings.yoloMode ? 'ON — full auto, no human gates' : 'OFF — human approval required'}`,
      };
    }
    case 'yoloAutoMergePrs': {
      if (!settings.yoloMode && value === 'true') {
        return {
          ok: false,
          message: 'PR auto-merge is only available when YOLO mode is enabled.',
        };
      }
      settings.yoloAutoMergePrs = value === 'true' && settings.yoloMode;
      return {
        ok: true,
        message: settings.yoloAutoMergePrs
          ? 'PR auto-merge ON — new review PRs will request GitHub auto-merge.'
          : 'PR auto-merge OFF — review PRs stay manual.',
      };
    }
    case 'testingEnabled': {
      settings.testingEnabled = value === 'true';
      if (settings.testingEnabled) {
        settings.reviewMode = 'full';
      }
      return {
        ok: true,
        message: `Mode: ${settings.testingEnabled ? 'Production (TDD enabled)' : 'Prototype (testing disabled)'}`,
      };
    }
    case 'reviewMode': {
      if (value !== 'full' && value !== 'light') {
        return {
          ok: false,
          message: 'Review mode must be "full" or "light".',
        };
      }
      if (value === 'light' && settings.testingEnabled) {
        return {
          ok: false,
          message: 'Light review mode is only available in Prototype mode. Disable testing first.',
        };
      }
      settings.reviewMode = value;
      return {
        ok: true,
        message: value === 'light'
          ? 'Review mode: Light (compile checks + dev server smoke test only)'
          : 'Review mode: Full (diff review + reviewer approval)',
      };
    }
    case 'autoAdvance': {
      return {
        ok: false,
        message: 'autoAdvance is runtime-managed and read-only.',
      };
    }
    default:
      return {
        ok: false,
        message: `Unknown setting "${setting}". Available: ${describeEditableKanbanSettings()}`,
      };
  }
}
