/**
 * SkillVisibilityRow, the switch that hides a skill from automatic model use.
 * The setting is stored by skill name, so the row is off for a skill that a
 * same-name skill replaces.
 */

import { Switch } from '@sero-ai/ui/components/ui/switch';

interface SkillVisibilityRowProps {
  name: string;
  visibleToModel: boolean;
  lockedHidden: boolean;
  /** True when a same-name skill wins, so this one is never loaded. */
  notUsed: boolean;
  onChange: (visible: boolean) => void;
}

function hintFor({ notUsed, lockedHidden, visibleToModel }: Pick<SkillVisibilityRowProps, 'notUsed' | 'lockedHidden' | 'visibleToModel'>): string {
  if (notUsed) return 'Set this on the skill that is used, because the setting follows the name';
  if (lockedHidden) return 'This skill requires explicit invocation';
  return visibleToModel ? 'Model can invoke this skill automatically' : 'Hidden, use /skill:name to invoke';
}

export function SkillVisibilityRow(props: SkillVisibilityRowProps) {
  const { name, visibleToModel, lockedHidden, notUsed, onChange } = props;
  return (
    <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-foreground/85">Model Visibility</p>
        <p className="text-sm text-muted-foreground/60">{hintFor(props)}</p>
      </div>
      <Switch
        checked={visibleToModel}
        disabled={lockedHidden || notUsed}
        onCheckedChange={onChange}
        aria-label={`Toggle model visibility for ${name}`}
      />
    </div>
  );
}
