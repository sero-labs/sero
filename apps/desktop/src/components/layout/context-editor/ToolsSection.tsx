import { Wrench } from 'lucide-react';
import type { ContextToolInfo } from '@/types/ipc';
import { CapabilitySection } from './CapabilitySection';

interface ToolsSectionProps {
  tools: ContextToolInfo[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}

export function ToolsSection({
  tools,
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
      items={tools}
      allDisabled={allDisabled}
      enabledCount={enabledCount}
      isEnabled={isEnabled}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
    />
  );
}
