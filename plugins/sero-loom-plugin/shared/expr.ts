// A tiny, safe expression language for Loom. Pure parser (no Three.js) so both
// the extension (validation) and the UI (compilation to TSL) can use it.
//
// Grammar (precedence low→high):
//   expr    := add
//   add     := mul (('+'|'-') mul)*
//   mul     := unary (('*'|'/'|'%') unary)*
//   unary   := '-' unary | postfix
//   postfix := primary ('.' ident)*            // member access: p.x
//   primary := number | ident '(' args ')' | ident | '(' expr ')'
//
// No assignment, no loops, no recursion — expressions are pure and bounded, so
// they cannot hang or execute arbitrary code. Variables/functions are resolved
// at compile time against a whitelist.

export type ExprNode =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'member'; obj: ExprNode; prop: string }
  | { k: 'unary'; op: '-'; x: ExprNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '%'; a: ExprNode; b: ExprNode }
  | { k: 'call'; name: string; args: ExprNode[] };

export const EXPR_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'abs', 'floor', 'ceil', 'fract', 'sign', 'sqrt', 'exp', 'log',
  'pow', 'min', 'max', 'mod', 'mix', 'clamp', 'smoothstep', 'step',
  'length', 'noise', 'dot', 'cross', 'normalize',
  'vec2', 'vec3', 'vec4',
]);

// Superset of variables available across contexts (validated leniently here;
// the UI compiler provides the exact set per field — see the env passed in
// sdf-compile / the layer builders). `depth`/`ny` are raymarch colorDrive vars,
// `speed` is a particle colorDrive var.
export const EXPR_VARS = new Set(['t', 'pi', 'p', 'id', 'uv', 'depth', 'ny', 'speed']);

const MAX_LEN = 600;
const MAX_NODES = 256;

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i + 1;
      while (j < n && /[0-9.eE+-]/.test(src[j])) {
        // allow exponent sign only right after e/E
        if ((src[j] === '+' || src[j] === '-') && !(src[j - 1] === 'e' || src[j - 1] === 'E')) break;
        j++;
      }
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Invalid number near "${src.slice(i, j)}"`);
      toks.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/%(),.'.includes(c)) {
      toks.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}"`);
  }
  return toks;
}

class Parser {
  private pos = 0;
  private count = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private next(): Tok | undefined {
    return this.toks[this.pos++];
  }
  private expectOp(op: string): void {
    const t = this.next();
    if (!t || t.t !== 'op' || t.v !== op) throw new Error(`Expected "${op}"`);
  }
  private node<T extends ExprNode>(n: T): T {
    if (++this.count > MAX_NODES) throw new Error('Expression too complex');
    return n;
  }

  parse(): ExprNode {
    const e = this.parseAdd();
    if (this.pos !== this.toks.length) throw new Error('Unexpected trailing input');
    return e;
  }

  private parseAdd(): ExprNode {
    let left = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        const right = this.parseMul();
        left = this.node({ k: 'bin', op: t.v as '+' | '-', a: left, b: right });
      } else break;
    }
    return left;
  }

  private parseMul(): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) {
        this.next();
        const right = this.parseUnary();
        left = this.node({ k: 'bin', op: t.v as '*' | '/' | '%', a: left, b: right });
      } else break;
    }
    return left;
  }

  private parseUnary(): ExprNode {
    const t = this.peek();
    if (t && t.t === 'op' && t.v === '-') {
      this.next();
      return this.node({ k: 'unary', op: '-', x: this.parseUnary() });
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExprNode {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && t.v === '.') {
        this.next();
        const id = this.next();
        if (!id || id.t !== 'id') throw new Error('Expected property name after "."');
        e = this.node({ k: 'member', obj: e, prop: id.v });
      } else break;
    }
    return e;
  }

  private parsePrimary(): ExprNode {
    const t = this.next();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.t === 'num') return this.node({ k: 'num', v: t.v });
    if (t.t === 'op' && t.v === '(') {
      const e = this.parseAdd();
      this.expectOp(')');
      return e;
    }
    if (t.t === 'id') {
      const nxt = this.peek();
      if (nxt && nxt.t === 'op' && nxt.v === '(') {
        this.next();
        const args: ExprNode[] = [];
        if (!(this.peek()?.t === 'op' && this.peek()?.v === ')')) {
          args.push(this.parseAdd());
          while (this.peek()?.t === 'op' && this.peek()?.v === ',') {
            this.next();
            args.push(this.parseAdd());
          }
        }
        this.expectOp(')');
        if (!EXPR_FUNCTIONS.has(t.v)) throw new Error(`Unknown function "${t.v}"`);
        return this.node({ k: 'call', name: t.v, args });
      }
      return this.node({ k: 'var', name: t.v });
    }
    throw new Error(`Unexpected token "${'v' in t ? t.v : '?'}"`);
  }
}

export function parseExpr(src: string): ExprNode {
  if (typeof src !== 'string') throw new Error('Expression must be a string');
  if (src.length > MAX_LEN) throw new Error('Expression too long');
  const toks = tokenize(src);
  if (toks.length === 0) throw new Error('Empty expression');
  return new Parser(toks).parse();
}

export interface ExprCheck {
  ok: boolean;
  error?: string;
}

/** Validate an expression string: parses + checks variables against the superset. */
export function validateExpr(src: string): ExprCheck {
  try {
    const ast = parseExpr(src);
    const bad = firstUnknownVar(ast);
    if (bad) return { ok: false, error: `Unknown variable "${bad}"` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid expression' };
  }
}

function firstUnknownVar(n: ExprNode): string | null {
  return firstUnknownVarIn(n, EXPR_VARS);
}

/**
 * Validate against an exact allowed-variable set for a specific field context
 * (matches the env the UI compiler provides). `pi` is always allowed. This
 * catches expressions that would parse but silently fall back at render time
 * because they reference a variable not in that field's scope.
 */
export function validateExprWith(src: string, allowed: Set<string>): ExprCheck {
  try {
    const ast = parseExpr(src);
    const bad = firstUnknownVarIn(ast, allowed);
    if (bad) return { ok: false, error: `Unknown variable "${bad}" in this context` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid expression' };
  }
}

function firstUnknownVarIn(n: ExprNode, allowed: Set<string>): string | null {
  switch (n.k) {
    case 'num':
      return null;
    case 'var':
      return n.name === 'pi' || allowed.has(n.name) ? null : n.name;
    case 'member':
      return firstUnknownVarIn(n.obj, allowed);
    case 'unary':
      return firstUnknownVarIn(n.x, allowed);
    case 'bin':
      return firstUnknownVarIn(n.a, allowed) ?? firstUnknownVarIn(n.b, allowed);
    case 'call':
      for (const a of n.args) {
        const r = firstUnknownVarIn(a, allowed);
        if (r) return r;
      }
      return null;
  }
}
