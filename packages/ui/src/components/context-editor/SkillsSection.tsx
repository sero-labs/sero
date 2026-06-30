import { Sparkles } from 'lucide-react';
import type { ContextSkillInfo } from '@sero-ai/common';
import { CapabilitySection } from './CapabilitySection';

interface SkillsSectionProps {
  items: ContextSkillInfo[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}

export function SkillsSection({
  items,
  allDisabled,
  enabledCount,
  isEnabled,
  onToggle,
  onToggleAll,
}: SkillsSectionProps) {
  return (
    <CapabilitySection
      icon={Sparkles}
      title="Skills"
      tint="violet"
      includeAllLabel="Include all skills"
      emptyLabel="No skills available"
      items={items}
      allDisabled={allDisabled}
      enabledCount={enabledCount}
      isEnabled={isEnabled}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
    />
  );
}
