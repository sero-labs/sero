/**
 * Minimal shell helpers for command analysis and safe rewriting.
 *
 * These are deliberately conservative. A false positive here costs one
 * optimisation; a false negative would change a command's meaning, so every
 * parser fails closed and callers discard a rewrite they cannot bind safely.
 */

export interface ShellToken {
  value: string;
  start: number;
  end: number;
}

export interface ShellSegment {
  text: string;
  start: number;
  end: number;
}

export interface SplitCommand {
  segments: ShellSegment[];
  separators: string[];
  hasTopLevelPipe: boolean;
}

const QUOTE_CHARS = new Set(['"', "'", '`']);
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

interface QuoteState {
  quote: string | null;
  escaped: boolean;
}

/**
 * Advance one character's quote/escape state.
 *
 * Returns true when the character was consumed by the state machine and the
 * caller must not treat it as a top-level operator.
 */
function advance(state: QuoteState, character: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (state.quote !== null) {
    if (character === '\\' && state.quote !== "'") {
      state.escaped = true;
      return true;
    }
    if (character === state.quote) state.quote = null;
    return true;
  }
  if (character === '\\') {
    state.escaped = true;
    return true;
  }
  if (QUOTE_CHARS.has(character)) {
    state.quote = character;
    return true;
  }
  return false;
}

/**
 * Split a command on top-level `|`, `|&`, `&&`, `||`, `;` and newlines.
 *
 * Redirection operators such as `2>&1` are not separators. A `&` that is
 * preceded by `>` or `<` is left in place.
 */
export function splitTopLevelSegments(command: string): SplitCommand {
  const segments: ShellSegment[] = [];
  const separators: string[] = [];
  const state: QuoteState = { quote: null, escaped: false };
  let start = 0;
  let hasTopLevelPipe = false;

  const push = (end: number, separator?: string): void => {
    segments.push({ text: command.slice(start, end), start, end });
    if (separator !== undefined) separators.push(separator);
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? '';
    const next = command[index + 1] ?? '';
    const previous = index > 0 ? (command[index - 1] ?? '') : '';
    if (advance(state, character)) continue;

    if (character === '&' && (previous === '>' || previous === '<')) continue;

    let separator: string | undefined;
    let length = 1;
    if (character === '|' && next === '|') {
      separator = '||';
      length = 2;
    } else if (character === '|' && next === '&') {
      separator = '|&';
      length = 2;
      hasTopLevelPipe = true;
    } else if (character === '|') {
      separator = '|';
      hasTopLevelPipe = true;
    } else if (character === '&' && next === '&') {
      separator = '&&';
      length = 2;
    } else if (character === '&' || character === ';' || character === '\n') {
      separator = character;
    }

    if (separator === undefined) continue;
    push(index, separator);
    index += length - 1;
    start = index + 1;
  }

  push(command.length);
  return { segments, separators, hasTopLevelPipe };
}

/** Tokenise one segment with quotes and escapes removed. */
export function tokenizeShellSegment(segment: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let index = 0;

  while (index < segment.length) {
    while (index < segment.length && /\s/.test(segment[index] ?? '')) index += 1;
    if (index >= segment.length) break;

    const start = index;
    let value = '';
    let quote: string | null = null;

    while (index < segment.length) {
      const character = segment[index] ?? '';
      if (quote !== null) {
        if (character === '\\' && quote !== "'") {
          value += segment[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (character === quote) {
          quote = null;
          index += 1;
          continue;
        }
        value += character;
        index += 1;
        continue;
      }
      if (character === '\\') {
        value += segment[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (QUOTE_CHARS.has(character)) {
        quote = character;
        index += 1;
        continue;
      }
      if (/\s/.test(character)) break;
      value += character;
      index += 1;
    }

    tokens.push({ value, start, end: index });
  }

  return tokens;
}

/** Drop leading `VAR=value` assignments from a token list. */
export function stripEnvAssignments(tokens: ShellToken[]): ShellToken[] {
  let index = 0;
  while (index < tokens.length && ENV_ASSIGNMENT.test(tokens[index]?.value ?? '')) index += 1;
  return tokens.slice(index);
}

/** The executable name of a command word, without its path. */
export function commandBasename(word: string): string {
  const normalized = word.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? normalized;
}

/** Quote one value for safe use as a shell word. */
export function quoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** The first command word of a segment, or undefined when the segment is empty. */
export function segmentCommandWord(segment: ShellSegment): string | undefined {
  const tokens = stripEnvAssignments(tokenizeShellSegment(segment.text));
  return tokens[0]?.value;
}
