import { Button } from '@sero-ai/ui';
import { Minus, Plus } from 'lucide-react';

export interface CountStepperProps {
  value: number;
  min: number;
  max: number;
  label: string;
  decrementLabel: string;
  incrementLabel: string;
  disabled?: boolean;
  onChange(value: number): void;
}

/** A bounded integer control shared by Design creation and Settings. */
export function CountStepper({
  value,
  min,
  max,
  label,
  decrementLabel,
  incrementLabel,
  disabled = false,
  onChange,
}: CountStepperProps) {
  return (
    <div
      aria-label={label}
      className={`border-input flex h-9 items-center justify-between rounded-md border ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <StepButton
        label={decrementLabel}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-3.5" />
      </StepButton>
      <span className="tabular-nums" aria-live="polite">
        {value}
      </span>
      <StepButton
        label={incrementLabel}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3.5" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
