/**
 * A stand-in for the shared model picker, for tests that mock '@sero-ai/ui'.
 *
 * The real one is a Base UI combobox, driven by typing. This renders a plain
 * <select> holding the field's accessible name and every option the picker
 * would list - the caller's fixed choices first, then each model with its
 * provider - so a test changes the value with a change event and the component
 * receives it through `onChange`, as it would from the real control.
 */

interface StandInModel {
  provider: string;
  modelId: string;
  name: string;
}

interface StandInGroup {
  displayName: string;
  models: StandInModel[];
}

export function AvailableModelPicker({
  groups,
  value,
  onChange,
  leadingOptions,
  ariaLabel,
  disabled,
}: {
  groups?: StandInGroup[];
  value?: string;
  onChange?: (value: string) => void;
  leadingOptions?: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const options = [
    ...(leadingOptions ?? []),
    ...(groups ?? []).flatMap((group) =>
      group.models.map((model) => ({
        value: `${model.provider}/${model.modelId}`,
        label: `${model.name} · ${group.displayName}`,
      })),
    ),
  ];

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
