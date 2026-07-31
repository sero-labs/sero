/**
 * What "wrong" looks like everywhere in the engine (spec §8).
 *
 * One fault type serves the validators, the codec and the tools, because the
 * same faults reach three different readers: a test asserting a fault class, a
 * panel listing checks for the user, and — the demanding one — a model being
 * asked to repair its own output.
 *
 * That last reader is why `message` is a sentence and not a code. A model given
 * `E_ROW_LEN` cannot act; a model given "row 7 has 31 cells, the canvas is 32
 * wide — add one cell" can. `code` exists alongside it so tests and UI can group
 * faults without parsing English.
 */

export type FaultSeverity = 'error' | 'warning';

/** Where a fault happened. Every field is optional; a fault names what it knows. */
export interface FaultLocation {
  frameId?: string;
  clipId?: string;
  partId?: string;
  variantId?: string;
  /** Palette index, for palette faults. */
  index?: number;
  x?: number;
  y?: number;
}

export interface Fault {
  /** Stable machine name of the fault class, e.g. `row-length`, `lock-violation`. */
  code: string;
  severity: FaultSeverity;
  /** One sentence, written to be read by a model: what is wrong and what to do. */
  message: string;
  where?: FaultLocation;
}

/** An error: the art is rejected until it is fixed. */
export function error(code: string, message: string, where?: FaultLocation): Fault {
  return where ? { code, severity: 'error', message, where } : { code, severity: 'error', message };
}

/** A warning: reported, and the art still compiles. */
export function warning(code: string, message: string, where?: FaultLocation): Fault {
  return where ? { code, severity: 'warning', message, where } : { code, severity: 'warning', message };
}

export function hasErrors(faults: readonly Fault[]): boolean {
  return faults.some((fault) => fault.severity === 'error');
}

export function errorsOnly(faults: readonly Fault[]): Fault[] {
  return faults.filter((fault) => fault.severity === 'error');
}

/**
 * Faults as the text a model is handed back.
 *
 * Errors come first because they are what blocks the run, and the list is capped
 * so a grid that is wrong in a thousand cells does not fill the context window
 * with a thousand near-identical lines.
 */
export function describeFaults(faults: readonly Fault[], limit = 40): string {
  const ordered = [...errorsOnly(faults), ...faults.filter((fault) => fault.severity === 'warning')];
  const shown = ordered.slice(0, limit).map((fault) => `- ${fault.message}`);
  const hidden = ordered.length - shown.length;
  if (hidden > 0) shown.push(`- …and ${hidden} more of the same kind`);
  return shown.join('\n');
}
