/**
 * ProviderCard — collapsible card showing provider health, default model,
 * and optional per-provider tier overrides.
 */

import { useState, useCallback } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { TierModelPicker, type TierModelSelection } from './TierModelPicker';
import type { AvailableModelGroupIPC, ProviderHealthStatusIPC } from '../hooks/useSeroFiles';

type TierKey = 'LOW' | 'MED' | 'HIGH';
const TIERS: readonly TierKey[] = ['LOW', 'MED', 'HIGH'] as const;

interface ProviderCardProps {
  providerId: string;
  displayName: string;
  /** Effective HIGH-tier model (the representative default). */
  defaultModel: string;
  health: ProviderHealthStatusIPC;
  healthMessage?: string;
  canReconnect: boolean;
  /** Current per-provider tier overrides (may be empty). */
  overrides: Partial<Record<TierKey, string>>;
  /** Built-in default models for this provider. */
  builtInDefaults: Partial<Record<TierKey, string>>;
  /** Available models for this provider (for the tier pickers). */
  modelGroups: AvailableModelGroupIPC[];
  onTierChange: (providerId: string, tier: TierKey, selection: TierModelSelection) => void;
  onReset: (providerId: string) => void;
  onReconnect: (providerId: string) => void;
}

const HEALTH_DISPLAY: Record<
  ProviderHealthStatusIPC,
  { dot: string; label: string; color: string }
> = {
  healthy: { dot: '●', label: 'ready', color: 'text-emerald-400' },
  broken_expired: { dot: '⚠', label: 'reconnect required', color: 'text-amber-400' },
  broken_invalid: { dot: '⚠', label: 'credentials invalid', color: 'text-destructive' },
  env: { dot: '●', label: 'env configured', color: 'text-primary' },
  local: { dot: '●', label: 'local', color: 'text-sky-400' },
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
  const hasOverrides = Object.values(overrides).some((value) => Boolean(value && value.length > 0));
  const healthInfo = HEALTH_DISPLAY[health];
  const isUnhealthy = health !== 'healthy' && health !== 'env' && health !== 'local';

  const handleTierChange = useCallback((tier: TierKey, selection: TierModelSelection) => {
    onTierChange(providerId, tier, selection);
  }, [onTierChange, providerId]);

  return (
    <div className="rounded-xl border border-border/40 bg-background/60 transition-colors">
      <button
        onClick={() => setExpanded((current) => !current)}
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
            {healthMessage ?? (defaultModel || 'No models available')}
          </p>
        </div>

        {canReconnect && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 border-amber-500/30 px-2 text-[10px] text-amber-400 hover:bg-amber-500/10"
            onClick={(event) => {
              event.stopPropagation();
              onReconnect(providerId);
            }}
          >
            {health === 'missing' ? 'Authenticate' : 'Re-authenticate'}
          </Button>
        )}

        <span
          className={cn(
            'shrink-0 text-xs text-muted-foreground transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        >
          ▸
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier} className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {tier}
                </span>
                <TierModelPicker
                  value={
                    overrides[tier]
                      ? { providerId, modelId: overrides[tier]! }
                      : null
                  }
                  providerFilter={providerId}
                  placeholder={builtInDefaults[tier] ?? 'model-id'}
                  providerLabel={displayName}
                  modelGroups={modelGroups}
                  onSelect={(selection) => handleTierChange(tier, selection)}
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

          {!hasOverrides && isUnhealthy && healthMessage && (
            <p className="mt-3 text-[11px] text-muted-foreground/70">{healthMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
