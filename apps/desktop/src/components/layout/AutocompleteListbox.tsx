import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

interface UseAutocompleteListboxOptions<T> {
  items: readonly T[];
  open: boolean;
  onSelect: (item: T) => void;
  onClose: () => void;
  resetKey?: unknown;
}

export function useAutocompleteListbox<T>({
  items,
  open,
  onSelect,
  onClose,
  resetKey,
}: UseAutocompleteListboxOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    setSelectedIndex(0);
  }, [resetKey]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (items.length === 0) return 0;
      return current >= items.length ? items.length - 1 : current;
    });
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current.get(selectedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open || items.length === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((current) => (current + 1) % items.length);
          break;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((current) => (current - 1 + items.length) % items.length);
          break;
        case 'Enter':
        case 'Tab': {
          event.preventDefault();
          event.stopPropagation();
          const item = items[selectedIndex];
          if (item) {
            onSelect(item);
          }
          break;
        }
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
      }
    },
    [items, onClose, onSelect, open, selectedIndex],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown, open]);

  const registerItemRef = useCallback(
    (index: number) => (element: HTMLDivElement | null) => {
      if (element) {
        itemRefs.current.set(index, element);
        return;
      }
      itemRefs.current.delete(index);
    },
    [],
  );

  const handleItemMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, item: T) => {
      event.preventDefault();
      onSelect(item);
    },
    [onSelect],
  );

  return {
    selectedIndex,
    setSelectedIndex,
    registerItemRef,
    handleItemMouseDown,
  };
}

export function AutocompleteListbox({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      role="listbox"
      className={cn(
        'absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg',
        className,
      )}
      {...props}
    />
  );
}

export function AutocompleteListboxHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 bg-[var(--bg-surface)] px-2 py-1.5 text-base font-semibold uppercase tracking-wider text-[var(--text-muted)]',
        className,
      )}
      {...props}
    />
  );
}

interface AutocompleteListboxOptionProps extends ComponentPropsWithoutRef<'div'> {
  selected: boolean;
  optionRef?: (element: HTMLDivElement | null) => void;
}

export function AutocompleteListboxOption({
  className,
  selected,
  optionRef,
  ...props
}: AutocompleteListboxOptionProps) {
  return (
    <div
      ref={optionRef}
      role="option"
      aria-selected={selected}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-base',
        selected
          ? 'bg-accent text-accent-foreground'
          : 'text-[var(--text-primary)] hover:bg-accent/50',
        className,
      )}
      {...props}
    />
  );
}
