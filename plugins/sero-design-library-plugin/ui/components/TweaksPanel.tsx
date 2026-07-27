/**
 * The Tweaks panel.
 *
 * Nothing here knows anything about a particular design: the controls, groups,
 * labels and ranges all come from the manifest the model authored for that
 * exact page. Changing a control updates the preview immediately through the
 * value-only channel and autosaves; the saved revision is only checkpointed at
 * a session boundary, so a slider drag cannot create revision spam.
 */

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  IconButton,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Text,
  cn,
} from '@sero-ai/ui';
import { Copy, RotateCcw } from 'lucide-react';
import type {
  DroppedTweakControl,
  TweakDefinition,
  TweakManifest,
  TweakValue,
} from '../../shared/tweak-types';

export interface TweaksPanelProps {
  manifest: TweakManifest;
  values: Record<string, TweakValue>;
  overrides: Record<string, TweakValue>;
  dropped: DroppedTweakControl[];
  onChange: (id: string, value: TweakValue) => void;
  onReset: (id?: string) => void;
  onCopyCss: () => void;
}

export function TweaksPanel({
  manifest,
  values,
  overrides,
  dropped,
  onChange,
  onReset,
  onCopyCss,
}: TweaksPanelProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, TweakDefinition[]>();
    for (const definition of manifest.controls) {
      const bucket = grouped.get(definition.group) ?? [];
      bucket.push(definition);
      grouped.set(definition.group, bucket);
    }
    return [...grouped.entries()];
  }, [manifest]);

  const [showDropped, setShowDropped] = useState(false);
  const overriddenCount = Object.keys(overrides).length;

  return (
    <section aria-label="Tweaks" className="dl-tweaks">
      <header className="dl-tweaks__head">
        <div className="dl-tweaks__heading">
          <span className="dl-eyebrow">Tweaks</span>
          <Text variant="muted" className="text-xs">
            {overriddenCount > 0 ? `${overriddenCount} changed` : 'At generated defaults'}
          </Text>
        </div>
        <div className="dl-tweaks__actions">
          <Button onClick={onCopyCss} size="sm" variant="ghost">
            <Copy aria-hidden="true" size={13} />
            Copy CSS
          </Button>
          <Button
            disabled={overriddenCount === 0}
            onClick={() => onReset()}
            size="sm"
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" size={13} />
            Reset all
          </Button>
        </div>
      </header>

      <Separator />

      {manifest.controls.length === 0 ? (
        <Text variant="muted" className="dl-tweaks__empty">
          This design exposes no adjustable properties.
        </Text>
      ) : (
        <ScrollArea className="dl-tweaks__scroll">
          {groups.map(([group, definitions]) => (
            <div className="dl-tweaks__group" key={group}>
              <div className="dl-tweaks__group-head">
                <span>{group}</span>
                <Badge variant="secondary">{definitions.length}</Badge>
              </div>
              {definitions.map((definition) => (
                <TweakControlRow
                  definition={definition}
                  key={definition.id}
                  onChange={onChange}
                  onReset={onReset}
                  overridden={overrides[definition.id] !== undefined}
                  value={values[definition.id] ?? definition.defaultValue}
                />
              ))}
            </div>
          ))}
        </ScrollArea>
      )}

      {dropped.length > 0 ? (
        <div className="dl-tweaks__dropped">
          <Button
            onClick={() => setShowDropped((current) => !current)}
            size="sm"
            variant="ghost"
          >
            {dropped.length} controls were removed
          </Button>
          {showDropped ? (
            <ul className="dl-tweaks__dropped-list">
              {dropped.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}</strong> {entry.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

interface RowProps {
  definition: TweakDefinition;
  value: TweakValue;
  overridden: boolean;
  onChange: (id: string, value: TweakValue) => void;
  onReset: (id?: string) => void;
}

function TweakControlRow({ definition, value, overridden, onChange, onReset }: RowProps) {
  const controlId = `tweak-${definition.id}`;

  return (
    <div className={cn('dl-tweak', overridden && 'dl-tweak--overridden')}>
      <div className="dl-tweak__label">
        <Label htmlFor={controlId}>{definition.label}</Label>
        {overridden ? (
          <IconButton
            className="dl-tweak__reset"
            icon={RotateCcw}
            label={`Reset ${definition.label}`}
            onClick={() => onReset(definition.id)}
            size="xs"
          />
        ) : null}
      </div>
      <TweakInput controlId={controlId} definition={definition} onChange={onChange} value={value} />
    </div>
  );
}

function TweakInput({
  controlId,
  definition,
  value,
  onChange,
}: {
  controlId: string;
  definition: TweakDefinition;
  value: TweakValue;
  onChange: (id: string, value: TweakValue) => void;
}) {
  const control = definition.control;

  if (control.type === 'range') {
    const numeric = typeof value === 'number' ? value : Number(definition.defaultValue);
    return (
      <div className="dl-tweak__range">
        <Slider
          aria-label={definition.label}
          id={controlId}
          max={control.max}
          min={control.min}
          onValueChange={([next]) => {
            if (next !== undefined) onChange(definition.id, next);
          }}
          step={control.step}
          value={[numeric]}
        />
        <output className="dl-tweak__value" htmlFor={controlId}>
          {numeric}{control.unit ?? ''}
        </output>
      </div>
    );
  }

  if (control.type === 'toggle') {
    return (
      <Switch
        aria-label={definition.label}
        checked={value === control.onValue}
        id={controlId}
        onCheckedChange={(checked) =>
          onChange(definition.id, checked ? control.onValue : control.offValue)}
      />
    );
  }

  if (control.type === 'colour') {
    const colour = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
    return (
      <label className="dl-tweak__colour">
        <input
          aria-label={definition.label}
          id={controlId}
          onChange={(event) => onChange(definition.id, event.target.value)}
          type="color"
          value={colour}
        />
        <span className="dl-tweak__value">{colour}</span>
      </label>
    );
  }

  return (
    <Select
      onValueChange={(next) => {
        const chosen = control.options.find((option) => String(option.value) === next);
        if (chosen) onChange(definition.id, chosen.value);
      }}
      value={String(value)}
    >
      <SelectTrigger aria-label={definition.label} className="dl-tweak__select" id={controlId} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {control.options.map((option) => (
          <SelectItem key={String(option.value)} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
