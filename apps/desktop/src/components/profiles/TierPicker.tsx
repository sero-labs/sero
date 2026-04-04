/**
 * TierPicker — onboarding step for picking default models per tier.
 *
 * Shows three dropdowns (LOW/MED/HIGH) populated with available models.
 * Includes a "use same for all" toggle and a skip button.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui/components/ui/select';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { Label } from '@sero-ai/ui/components/ui/label';
import type { ModelTierSettings, ModelTierEntry, AvailableModelGroup } from '@/types/ipc';

interface AvailableModel {
  provider: string;
  modelId: string;
  name: string;
  providerName: string;
}

interface TierPickerProps {
  onComplete: (tiers: ModelTierSettings) => void;
  onSkip: () => void;
}

const TIER_META = [
  { key: 'LOW' as const, label: 'Low', desc: 'Fast, cheap tasks — scouts, quick lookups' },
  { key: 'MED' as const, label: 'Medium', desc: 'Everyday agents — analysis, implementation, review' },
  { key: 'HIGH' as const, label: 'High', desc: 'Complex reasoning — planning, coordination' },
] as const;

function modelKey(m: { provider: string; modelId: string }): string {
  return `${m.provider}/${m.modelId}`;
}

function parseModelKey(key: string): ModelTierEntry | null {
  const idx = key.indexOf('/');
  if (idx === -1) return null;
  return { provider: key.slice(0, idx), modelId: key.slice(idx + 1) };
}

function flattenModels(groups: AvailableModelGroup[]): AvailableModel[] {
  const flat: AvailableModel[] = [];
  for (const group of groups) {
    for (const m of group.models) {
      flat.push({
        provider: m.provider,
        modelId: m.modelId,
        name: m.name,
        providerName: group.displayName,
      });
    }
  }
  return flat;
}

export function TierPicker({ onComplete, onSkip }: TierPickerProps) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [sameForAll, setSameForAll] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Load available models via session-independent IPC bridge
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const groups = await window.sero.models.list();
        if (cancelled) return;
        setModels(flattenModels(groups));
      } catch {
        // No models available
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = useCallback((tier: string, value: string) => {
    setSelections((prev) => {
      if (sameForAll) {
        return { LOW: value, MED: value, HIGH: value };
      }
      return { ...prev, [tier]: value };
    });
  }, [sameForAll]);

  const handleSameToggle = useCallback((checked: boolean) => {
    setSameForAll(checked);
    if (checked) {
      const first = selections.LOW || selections.MED || selections.HIGH || '';
      setSelections({ LOW: first, MED: first, HIGH: first });
    }
  }, [selections]);

  const handleComplete = useCallback(() => {
    const tiers: ModelTierSettings = {};
    for (const { key } of TIER_META) {
      const val = selections[key];
      if (val) {
        const parsed = parseModelKey(val);
        if (parsed) tiers[key] = parsed;
      }
    }
    onComplete(tiers);
  }, [selections, onComplete]);

  const hasAnySelection = Object.values(selections).some(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading available models...
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="space-y-3 text-center py-4">
        <p className="text-sm text-muted-foreground">
          No models available. Sign in to a provider first.
        </p>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="same-for-all"
            checked={sameForAll}
            onCheckedChange={handleSameToggle}
          />
          <Label htmlFor="same-for-all" className="text-xs text-muted-foreground">
            Use the same model for all tiers
          </Label>
        </div>
      </div>

      <div className="space-y-3">
        {(sameForAll ? [TIER_META[0]] : TIER_META).map(({ key, label, desc }) => (
          <div key={key} className="space-y-1">
            <Label className="text-sm font-medium">
              {sameForAll ? 'All tiers' : label}
            </Label>
            <p className="text-xs text-muted-foreground">
              {sameForAll ? 'Single model for all task types' : desc}
            </p>
            <Select
              value={selections[key] || ''}
              onValueChange={(v) => handleSelect(key, v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={modelKey(m)} value={modelKey(m)}>
                    <span className="text-xs text-muted-foreground mr-1.5">
                      {m.providerName}
                    </span>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" onClick={handleComplete} disabled={!hasAnySelection}>
          Continue
        </Button>
      </div>
    </div>
  );
}
