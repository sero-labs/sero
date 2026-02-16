/**
 * Shared state shape for the Calculator app.
 *
 * Both the Pi extension and the Sero web UI read/write
 * a JSON file matching this shape.
 */

export interface HistoryEntry {
  id: number;
  expression: string;
  result: string;
  createdAt: string; // ISO string
}

export interface CalcState {
  /** Current display value */
  display: string;
  /** Full expression being built */
  expression: string;
  /** Calculation history (most recent first) */
  history: HistoryEntry[];
  /** Auto-increment ID for history entries */
  nextId: number;
}

export const DEFAULT_CALC_STATE: CalcState = {
  display: '0',
  expression: '',
  history: [],
  nextId: 1,
};
