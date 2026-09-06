"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStickToBottomContext } from "use-stick-to-bottom";

import { cn } from "../../lib/utils";

export interface ConversationVirtualListProps<T> {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  /** Return null for an item that renders nothing; it then takes no space. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Called on a user scroll that brings the viewport within `startThreshold` of the top. */
  onReachStart?: () => void;
  startThreshold?: number;
  estimateSize?: number;
  /** Reveal the initial transcript only after its last row is positioned. */
  initialScrollToEnd?: boolean;
  overscan?: number;
  /** Class for the wrapper around each rendered item, for example a bottom gap. */
  rowClassName?: string;
  className?: string;
}

/**
 * Windowed rows inside a `Conversation`. Only rows near the viewport are in
 * the DOM, so node count stays bounded for any thread length. The scroll
 * element and stick-to-bottom behavior stay with `StickToBottom`.
 *
 * Items prepended to `items` (older history) keep the viewport anchored:
 * the scroll offset moves by the height the new rows added above it.
 */
export function ConversationVirtualList<T>({
  items,
  getItemKey,
  renderItem,
  onReachStart,
  startThreshold = 240,
  estimateSize = 96,
  initialScrollToEnd = false,
  overscan = 6,
  rowClassName,
  className,
}: ConversationVirtualListProps<T>) {
  const { scrollRef, state: scrollState } = useStickToBottomContext();
  const [initialPositioned, setInitialPositioned] = useState(!initialScrollToEnd);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  // The parent scroll ref attaches after child layout effects. Read it after
  // commit so a cached transcript also gets a render with a viewport.
  useEffect(() => {
    setScrollElement(scrollRef.current);
  }, [scrollRef]);

  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => getItemKey(items[index], index),
  });

  // Virtual rows replace estimated heights over several frames. Position them
  // while hidden so opening history does not display those intermediate jumps.
  useEffect(() => {
    if (initialPositioned || !scrollElement || items.length === 0) return;
    let frame: number;
    let previousHeight = -1;
    let stableFrames = 0;
    const position = () => {
      const height = scrollElement.scrollHeight;
      const target = Math.max(0, scrollState.calculatedTargetScrollTop);
      const lastRow = virtualizer.getVirtualItems().at(-1);
      const settled = lastRow?.index === items.length - 1
        && Math.abs(scrollElement.scrollTop - target) <= 1
        && height === previousHeight;
      stableFrames = settled ? stableFrames + 1 : 0;
      previousHeight = height;
      scrollState.scrollTop = target;
      if (stableFrames >= 2) {
        setInitialPositioned(true);
        return;
      }
      frame = requestAnimationFrame(position);
    };
    frame = requestAnimationFrame(position);
    return () => cancelAnimationFrame(frame);
  }, [initialPositioned, items.length, scrollElement, scrollState, virtualizer]);

  // Prepend anchoring: remember where the previous first item went, and shift
  // the scroll offset by the height that now sits above it.
  const firstKeyRef = useRef<string | null>(null);
  const totalSizeRef = useRef(0);
  const firstKey = items.length > 0 ? getItemKey(items[0], 0) : null;

  useLayoutEffect(() => {
    const previousFirstKey = firstKeyRef.current;
    const previousTotal = totalSizeRef.current;
    firstKeyRef.current = firstKey;
    totalSizeRef.current = virtualizer.getTotalSize();

    if (previousFirstKey === null || previousFirstKey === firstKey) return;
    const previousFirstIndex = items.findIndex((item, index) => getItemKey(item, index) === previousFirstKey);
    if (previousFirstIndex <= 0) return;

    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    scrollElement.scrollTop += totalSizeRef.current - previousTotal;
  });

  // `onReachStart` fires on user scroll only, never on layout: an initial
  // render at offset 0 or a prepend must not cascade into more loads.
  const onReachStartRef = useRef(onReachStart);
  useLayoutEffect(() => {
    onReachStartRef.current = onReachStart;
  }, [onReachStart]);
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const handleScroll = () => {
      if (scrollElement.scrollTop <= startThreshold) onReachStartRef.current?.();
    };
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [scrollRef, startThreshold]);

  const measureRow = useCallback(
    (node: HTMLDivElement | null) => virtualizer.measureElement(node),
    [virtualizer],
  );

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height: virtualizer.getTotalSize(), visibility: initialPositioned ? undefined : "hidden" }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const content = renderItem(items[virtualRow.index], virtualRow.index);
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={measureRow}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {content === null ? null : <div className={rowClassName}>{content}</div>}
          </div>
        );
      })}
    </div>
  );
}
