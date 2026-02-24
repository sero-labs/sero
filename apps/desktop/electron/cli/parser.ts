export function splitCommandLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
      current += ch;
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
