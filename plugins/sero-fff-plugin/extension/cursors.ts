/**
 * Opaque pagination tokens.
 *
 * FFF hands back a native `GrepCursor` object and takes a page index for file
 * search. Neither is safe to put in model context, so both are stored here and
 * the agent only ever sees a short id. The stores are bounded so a long session
 * cannot grow them without limit.
 */

import type { GrepCursor } from '@ff-labs/fff-node';

const MAX_ENTRIES = 200;

class BoundedStore<T> {
  private readonly entries = new Map<string, T>();

  private counter = 0;

  constructor(private readonly prefix: string) {}

  put(value: T): string {
    this.counter += 1;
    const id = `${this.prefix}${this.counter}`;
    this.entries.set(id, value);
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    return id;
  }

  get(id: string): T | undefined {
    return this.entries.get(id);
  }
}

/** Continuation state for `find`, which paginates by page index, not by cursor. */
export interface FindCursor {
  root: string;
  query: string;
  pattern: string;
  pageSize: number;
  nextPageIndex: number;
}

export const grepCursors = new BoundedStore<GrepCursor>('g');
export const findCursors = new BoundedStore<FindCursor>('f');
