/**
 * A stand-in for the styled Select, for tests that mock '@sero-ai/ui'.
 *
 * The real one opens a Radix popover that jsdom cannot drive. This renders a
 * plain <select> with the trigger's accessible name, so a test changes the
 * value with a change event and the component under test receives it through
 * onValueChange, as it would from the real control.
 */
import { Children, isValidElement, type ReactNode } from 'react';

export function SelectTrigger(_props: { children?: ReactNode; 'aria-label'?: string; size?: string; className?: string }) {
  return null;
}

export function SelectValue(_props: { placeholder?: string }) {
  return null;
}

export function SelectContent({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function SelectItem({ value, children }: { value: string; children?: ReactNode }) {
  return <option value={value}>{children}</option>;
}

export function Select({
  value,
  disabled,
  onValueChange,
  children,
}: {
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}) {
  let label: string | undefined;
  const items: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<{ 'aria-label'?: string }>(child) && child.type === SelectTrigger) label = child.props['aria-label'];
    else items.push(child);
  });
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onValueChange?.(event.target.value)}>
      {items}
    </select>
  );
}
