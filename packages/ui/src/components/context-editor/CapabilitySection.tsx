import type { LucideIcon } from 'lucide-react';
import type { ContextSkillInfo, ContextToolInfo } from '@sero-ai/common';
import { Switch } from '../ui/switch';
import { ContextSection, ToggleRow } from './parts';

interface CapabilitySectionProps<TItem extends ContextToolInfo | ContextSkillInfo> {
  icon: LucideIcon;
  title: string;
  tint: 'amber' | 'violet';
  includeAllLabel: string;
  emptyLabel: string;
  items: TItem[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}

export function CapabilitySection<TItem extends ContextToolInfo | ContextSkillInfo>({
  icon,
  title,
  tint,
  includeAllLabel,
  emptyLabel,
  items,
  allDisabled,
  enabledCount,
  isEnabled,
  onToggle,
  onToggleAll,
}: CapabilitySectionProps<TItem>) {
  const badgeVariant = allDisabled
    ? 'disabled' as const
    : enabledCount < items.length
      ? 'partial' as const
      : 'default' as const;

  return (
    <ContextSection
      icon={icon}
      title={title}
      tint={tint}
      count={items.length}
      badge={
        items.length > 0 && enabledCount < items.length
          ? `${enabledCount}/${items.length} included`
          : undefined
      }
      badgeVariant={badgeVariant}
      defaultOpen={false}
    >
      <div className="space-y-1">
        {items.length > 0 && (
          <div className="mb-1 flex items-center justify-between rounded-md border-b border-border/20 px-2 pb-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              {includeAllLabel}
            </span>
            <Switch
              size="sm"
              checked={!allDisabled}
              onCheckedChange={(checked) => onToggleAll(!checked)}
            />
          </div>
        )}

        {items.map((item) => (
          <ToggleRow
            key={item.name}
            name={item.name}
            description={item.description}
            enabled={isEnabled(item.name)}
            onToggle={() => onToggle(item.name)}
          />
        ))}

        {items.length === 0 && (
          <span className="text-sm italic text-[var(--text-muted)]">
            {emptyLabel}
          </span>
        )}
      </div>
    </ContextSection>
  );
}
