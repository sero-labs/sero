import { Button, Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui';
import { Check, ChevronDown } from 'lucide-react';

import type { TweakOption, TweakValue } from '../../../shared/tweaks';
import { loadDesignFont, preloadDesignFonts } from '../../lib/design-fonts';

interface FontPickerProps {
  id: string;
  label: string;
  value: TweakValue;
  options: TweakOption[];
  onChange(value: TweakValue): void;
}

/** The two baseline font controls, rendered with each family visible in place. */
export function FontPicker({ id, label, value, options, onChange }: FontPickerProps) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Popover onOpenChange={(open) => open && preloadDesignFonts()}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-8 w-full justify-between px-2.5 font-normal"
          aria-label={label}
          style={{ fontFamily: String(selected?.value ?? value) }}
        >
          {selected?.label ?? String(value)}
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-64 overflow-y-auto" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-base"
              style={{ fontFamily: String(option.value) }}
              onMouseEnter={() => loadDesignFont(String(option.value))}
              onFocus={() => loadDesignFont(String(option.value))}
              onClick={() => {
                loadDesignFont(String(option.value));
                onChange(option.value);
              }}
            >
              <span className="flex-1">{option.label}</span>
              {option.value === value && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
