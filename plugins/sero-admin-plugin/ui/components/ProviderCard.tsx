/**
 * ProviderCard — collapsible card showing provider health, default model,
 * and optional per-provider tier overrides.
 */

import { useState, useCallback } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { TierModelPicker } from './TierModelPicker';
import type { AvailableModelGroupIPC } from '../hooks/useSeroFiles';

type TierKey = 'LOW' | 'MED' | 'HIGH';
const TIERS: readonly TierKey[] = ['LOW', 'MED', 'HIGH'] as const;

type HealthStatus = 'healthy' | 'expired' | 'invalid' | 'missing' | 'unknown';

interface ProviderCardProps {
  providerId: string;
  displayName: string;
  /** Effective HIGH-tier model (the representative default). */
  defaultModel: string;
  health: HealthStatus;
  healthMessage?: string;
  canReconnect: boolean;
  /** Current per-provider tier overrides (may be empty). */
  overrides: Partial<Record<TierKey, string>>;
  /** Built-in default models for this provider. */
  builtInDefaults: Partial<Record<TierKey, string>>;
  /** Available models for this provider (for the tier pickers). */
  modelGroups: AvailableModelGroupIPC[];
  onTierChange: (providerId: string, tier: TierKey, modelId: string) => void;
  onReset: (providerId: string) => void;
  onReconnect: (providerId: string) => void;
}

const HEALTH_DISPLAY: Record<HealthStatus, { dot: string; label: string; color: string }> = {
  healthy: { dot: '●', label: 'healthy', color: 'text-emerald-400' },
  expired: { dot: '⚠', label: 'expired', color: 'text-amber-400' },
  invalid: { dot: '⚠', label: 'invalid', color: 'text-amber-400' },
  missing: { dot: '○', label: 'not configured', color: 'text-muted-foreground' },
  unknown: { dot: '○', label: 'unknown', color: 'text-muted-foreground' },
};

export function ProviderCard({
  providerId,
  displayName,
  defaultModel,
  health,
  healthMessage,
  canReconnect,
  overrides,
  builtInDefaults,
  modelGroups,
  onTierChange,
  onReset,
  onReconnect,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverrides = Object.values(overrides).some((v) => v && v.length > 0);
  const healthInfo = HEALTH_DISPLAY[health];
  const isUnhealthy = health !== 'healthy';

  const handleTierChange = useCallback((tier: TierKey, modelId: string) => {
    onTierChange(providerId, tier, modelId);
  }, [providerId, onTierChange]);

  return (
    <div className="rounded-xl border border-border/40 bg-background/60 transition-colors">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{displayName}</span>
            <span className={cn('text-[10px]', healthInfo.color)}>
              {healthInfo.dot} {healthInfo.label}
            </span>
            {hasOverrides && (
              <span className="rounded bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                overridden
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isUnhealthy
              ? (healthMessage ?? `Provider ${health}`)
              : defaultModel || 'No models available'}
          </p>
        </div>

        {/* Re-authenticate action for unhealthy providers */}
        {isUnhealthy && canReconnect && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 border-amber-500/30 px-2 text-[10px] text-amber-400 hover:bg-amber-500/10"
            onClick={(e) => { e.stopPropagation(); onReconnect(providerId); }}
          >
            Re-authenticate
          </Button>
        )}

        {/* Chevron */}
        <span className={cn(
          'shrink-0 text-xs text-muted-foreground transition-transform duration-150',
          expanded && 'rotate-90',
        )}>
          ▸
        </span>
      </button>

      {/* Expanded — per-provider tier overrides */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier} className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {tier}
                </span>
                <TierModelPicker
                  value={overrides[tier] ?? ''}
                  providerFilter={providerId}
                  placeholder={builtInDefaults[tier] ?? 'model-id'}
                  modelGroups={modelGroups}
                  onSelect={(modelId) => handleTierChange(tier, modelId)}
                />
                <p className="text-[10px] text-muted-foreground/50">
                  default: {builtInDefaults[tier] ?? '—'}
                </p>
              </div>
            ))}
          </div>

          {hasOverrides && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => onReset(providerId)}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
