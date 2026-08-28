import { Button } from '@sero-ai/ui/components/ui/button';
import { Slider } from '@sero-ai/ui/components/ui/slider';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { RotateCcw } from 'lucide-react';

import type { TweakDefinition, TweakValue } from '../../../shared/tweaks';
import { tweakValueToCss } from '../../../shared/tweaks';
import { FontPicker } from './FontPicker';

/**
 * One authored control (spec §6.5).
 *
 * Generic on purpose: there is one renderer per control *kind*, never one per
 * design. The manifest decides what appears, so a control this page needs is
 * drawn by the same code as a control any other page needs, and nothing here
 * knows what `--display-scale` means.
 *
 * The value is always shown. A slider without its number tells you something
 * moved but not what to.
 */

export interface TweakControlProps {
  definition: TweakDefinition;
  value: TweakValue;
  edited: boolean;
  onChange(value: TweakValue): void;
  onReset(): void;
}

export function TweakControl({ definition, value, edited, onChange, onReset }: TweakControlProps) {
  const isFont = definition.id === 'font' || definition.id === 'body-font';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label
          id={`${controlId(definition)}-label`}
          className="text-sm"
          htmlFor={controlId(definition)}
        >
          {definition.label}
        </label>
        {!isFont && (
          <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
            {tweakValueToCss(definition.control, value)}
          </span>
        )}
        {/* Only once it differs: a reset that is always there reads as an
            action the control needs rather than one it is offering. */}
        {edited && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={isFont ? 'ml-auto size-5' : 'size-5'}
            aria-label={`Reset ${definition.label}`}
            title="Back to what this design shipped with"
            onClick={onReset}
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
      </div>
      <Input definition={definition} value={value} onChange={onChange} />
    </div>
  );
}

function controlId(definition: TweakDefinition): string {
  return `tweak-${definition.id}`;
}

function Input({
  definition,
  value,
  onChange,
}: Pick<TweakControlProps, 'definition' | 'value' | 'onChange'>) {
  const control = definition.control;

  switch (control.type) {
    case 'range':
      return (
        <Slider
          aria-labelledby={`${controlId(definition)}-label`}
          min={control.min}
          max={control.max}
          step={control.step}
          value={[typeof value === 'number' ? value : control.min]}
          onValueChange={([next]) => {
            if (next !== undefined) onChange(next);
          }}
        />
      );

    case 'choice':
      if (definition.id === 'font' || definition.id === 'body-font') {
        return (
          <FontPicker
            id={controlId(definition)}
            label={definition.label}
            value={value}
            options={control.options}
            onChange={onChange}
          />
        );
      }
      return (
        <div className="flex flex-wrap gap-1" role="group" aria-label={definition.label}>
          {control.options.map((option) => (
            <Button
              key={String(option.value)}
              type="button"
              size="sm"
              variant={option.value === value ? 'secondary' : 'ghost'}
              aria-pressed={option.value === value}
              className="h-7 px-2 font-normal"
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      );

    case 'toggle':
      return (
        <Switch
          id={controlId(definition)}
          checked={value === control.onValue}
          onCheckedChange={(checked) => onChange(checked ? control.onValue : control.offValue)}
        />
      );

    case 'colour':
      // No hex beside the swatch: the row above already states the value, and
      // every other control says it exactly once.
      return (
        <input
          id={controlId(definition)}
          type="color"
          aria-label={definition.label}
          value={typeof value === 'string' ? value : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="border-border h-7 w-14 cursor-pointer rounded border bg-transparent p-0.5"
        />
      );
  }
}
