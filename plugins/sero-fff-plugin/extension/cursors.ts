/**
 * Opaque pagination tokens.
 *
 * FFF hands back a native `GrepCursor` object and takes a page index for file
 * search. Neither is safe to put in model context, so both are stored here and
 * the agent only ever sees a short id. The stores are bounded so a long session
 * cannot grow them without limit.
 */

const MAX_ENTRIES = 200;

export class CursorExpiredError extends Error {
  constructor(id: string) {
    super(`Cursor "${id}" expired or does not belong to this search session. Start the search again.`);
    this.name = 'CursorExpiredError';
  }
}

export class BoundedCursorStore<T> {
  private readonly entries = new Map<string, T>();

  private counter = 0;

  constructor(
    private readonly prefix: string,
    private readonly maxEntries = MAX_ENTRIES,
  ) {}

  put(value: T): string {
    this.counter += 1;
    const id = `${this.prefix}${this.counter}`;
    this.entries.set(id, value);
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    return id;
  }

  take(id: string): T {
    const value = this.entries.get(id);
    if (value === undefined) throw new CursorExpiredError(id);
    this.entries.delete(id);
    return value;
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
