/**
 * Shared state shape for the Daily Quote app.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape.
 */

export interface Quote {
  text: string;
  author: string;
  generatedAt: string; // ISO datetime
}

export interface DailyQuoteState {
  quote: Quote | null;
  lastRefreshDate: string | null; // YYYY-MM-DD — prevents re-generating on same day
}

export const DEFAULT_STATE: DailyQuoteState = {
  quote: null,
  lastRefreshDate: null,
};
