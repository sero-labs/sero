/**
 * One command per line. A line break inside a quoted argument is part of that
 * argument, not the start of a new command: a script passed to
 * `--expression "..."` may span lines. The quote and escape rules are the
 * tokenizer's.
 */
export function splitCommandLines(input: string): string[] {
  const lines: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (const ch of input) {
    if (ch === '\n' && quote === null) {
      lines.push(current);
      current = '';
      escaping = false;
      continue;
    }
    current += ch;
    if (escaping) escaping = false;
    else if (ch === '\\') escaping = true;
    else if (quote === null && (ch === "'" || ch === '"')) quote = ch;
    else if (ch === quote) quote = null;
  }
  lines.push(current);
  return lines.map((line) => line.trim()).filter(Boolean);
}

export function tokenizeCliInput(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let escaping = false;

  const pushCurrent = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (escaping) {
      // Only consume the backslash for actual escape sequences that
      // affect tokenisation. For everything else (e.g. \n, \t), keep
      // the backslash so downstream handlers can interpret it.
      if (ch === '"' || ch === "'" || ch === '\\' || ch === ' ') {
        current += ch;
      } else {
        current += '\\' + ch;
      }
      escaping = false;
      continue;
    }

    if (ch === '\\') {
      escaping = true;
      continue;
    }

    if (quote === 'single') {
      if (ch === "'") {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (quote === 'double') {
      if (ch === '"') {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'") {
      quote = 'single';
      continue;
    }

    if (ch === '"') {
      quote = 'double';
      continue;
    }

    if (/\s/.test(ch)) {
      pushCurrent();
      continue;
    }

    current += ch;
  }

  if (escaping) {
    current += '\\';
  }
  if (quote) {
    throw new Error('Unterminated quoted string');
  }

  pushCurrent();
  return tokens;
}
