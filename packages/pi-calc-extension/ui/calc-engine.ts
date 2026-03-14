/**
 * Calculator engine — pure logic, no React dependencies.
 *
 * Handles expression building, evaluation, and display formatting.
 * Used by both the CalcApp component and could be used standalone.
 */

const OPERATORS = ['+', '-', '×', '÷'] as const;
type Operator = (typeof OPERATORS)[number];

export function isOperator(value: string): value is Operator {
  return OPERATORS.includes(value as Operator);
}

/** Convert display operators to JS math operators */
export function toMathExpr(expr: string): string {
  return expr.replace(/×/g, '*').replace(/÷/g, '/');
}

/**
 * Safe math evaluation — recursive descent parser.
 *
 * Avoids `new Function()` / `eval()` which are blocked by
 * Electron's Content Security Policy in the renderer process.
 *
 * Grammar:
 *   expr   = term (('+' | '-') term)*
 *   term   = unary (('*' | '/') unary)*
 *   unary  = '-' unary | factor
 *   factor = '(' expr ')' '%'? | number '%'?
 *   number = [0-9]+ ('.' [0-9]+)?
 */
export function evaluate(expression: string): string {
  const jsExpr = toMathExpr(expression);
  const tokens = tokenise(jsExpr);
  const ctx: ParseCtx = { tokens, pos: 0 };
  const result = parseExpr(ctx);

  if (ctx.pos < ctx.tokens.length) {
    throw new Error('Invalid expression');
  }
  if (!Number.isFinite(result)) {
    throw new Error('Error');
  }

  return formatResult(result);
}

// ── Tokeniser ────────────────────────────────────────────────

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'percent' };

function tokenise(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = expr.replace(/\s/g, '');

  while (i < src.length) {
    const ch = src[i];

    // Number (including decimals)
    if (ch >= '0' && ch <= '9' || ch === '.') {
      let num = '';
      while (i < src.length && (src[i] >= '0' && src[i] <= '9' || src[i] === '.')) {
        num += src[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'paren', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'paren', value: ')' }); i++; continue; }
    if (ch === '%') { tokens.push({ type: 'percent' }); i++; continue; }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch }); i++; continue;
    }

    throw new Error('Invalid expression');
  }

  return tokens;
}

// ── Recursive descent parser ─────────────────────────────────

interface ParseCtx { tokens: Token[]; pos: number; }

function peek(ctx: ParseCtx): Token | undefined { return ctx.tokens[ctx.pos]; }
function advance(ctx: ParseCtx): Token { return ctx.tokens[ctx.pos++]; }

/** expr = term (('+' | '-') term)* */
function parseExpr(ctx: ParseCtx): number {
  let left = parseTerm(ctx);
  while (true) {
    const t = peek(ctx);
    if (t?.type !== 'op' || (t.value !== '+' && t.value !== '-')) break;
    advance(ctx);
    const right = parseTerm(ctx);
    left = t.value === '+' ? left + right : left - right;
  }
  return left;
}

/** term = unary (('*' | '/') unary)* */
function parseTerm(ctx: ParseCtx): number {
  let left = parseUnary(ctx);
  while (true) {
    const t = peek(ctx);
    if (t?.type !== 'op' || (t.value !== '*' && t.value !== '/')) break;
    advance(ctx);
    const right = parseUnary(ctx);
    left = t.value === '*' ? left * right : left / right;
  }
  return left;
}

/** unary = '-' unary | factor */
function parseUnary(ctx: ParseCtx): number {
  const t = peek(ctx);
  if (t?.type === 'op' && t.value === '-') {
    advance(ctx);
    return -parseUnary(ctx);
  }
  return parseFactor(ctx);
}

/** factor = '(' expr ')' '%'? | number '%'? */
function parseFactor(ctx: ParseCtx): number {
  const tok = peek(ctx);

  if (tok?.type === 'paren' && tok.value === '(') {
    advance(ctx); // consume '('
    const val = parseExpr(ctx);
    const closing = advance(ctx);
    if (closing?.type !== 'paren' || closing.value !== ')') {
      throw new Error('Invalid expression');
    }
    if (peek(ctx)?.type === 'percent') { advance(ctx); return val / 100; }
    return val;
  }

  if (tok?.type === 'number') {
    advance(ctx);
    let val = (tok as { type: 'number'; value: number }).value;
    if (peek(ctx)?.type === 'percent') { advance(ctx); val /= 100; }
    return val;
  }

  throw new Error('Invalid expression');
}

/** Format a number for display */
export function formatResult(num: number): string {
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  // Remove trailing zeros
  const fixed = parseFloat(num.toFixed(10));
  return fixed.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

/** Format a number string for the display (add commas) */
export function formatDisplay(value: string): string {
  if (value === 'Error' || value === '') return value;

  // Handle negative
  const isNeg = value.startsWith('-');
  const abs = isNeg ? value.slice(1) : value;

  // Split integer and decimal parts
  const [intPart, decPart] = abs.split('.');

  // Add commas to integer part
  const formatted = parseInt(intPart || '0', 10).toLocaleString('en-US');

  let result = isNeg ? `-${formatted}` : formatted;
  if (decPart !== undefined) {
    result += `.${decPart}`;
  }

  return result;
}

/** Get the display size class based on value length */
export function getDisplaySizeClass(value: string): string {
  const len = value.replace(/,/g, '').length;
  if (len > 12) return 'very-long';
  if (len > 8) return 'long';
  return '';
}
