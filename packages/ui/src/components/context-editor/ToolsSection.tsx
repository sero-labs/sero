import { Wrench } from 'lucide-react';
import type { ContextToolInfo } from '@sero-ai/common';
import { CapabilitySection } from './CapabilitySection';

interface ToolsSectionProps {
  items: ContextToolInfo[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}

export function ToolsSection({
  items,
  allDisabled,
  enabledCount,
  isEnabled,
  onToggle,
  onToggleAll,
}: ToolsSectionProps) {
  return (
    <CapabilitySection
      icon={Wrench}
      title="Tools"
      tint="amber"
      includeAllLabel="Include all tools"
      emptyLabel="No tools available"
      items={items}
      allDisabled={allDisabled}
      enabledCount={enabledCount}
      isEnabled={isEnabled}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
    />
  );
}
