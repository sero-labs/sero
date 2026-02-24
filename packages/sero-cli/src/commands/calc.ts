/**
 * sero calc — evaluate math expressions.
 *
 * State: global-scoped.
 * Safe evaluation using Function constructor (same as extension).
 */

import type { CommandDef, Flags } from '../main.js';
import { resolveGlobalStatePath, readState, writeState } from '../state.js';

interface HistoryEntry {
  id: number;
  expression: string;
  result: string;
  createdAt: string;
}

interface CalcState {
  display: string;
  expression: string;
  history: HistoryEntry[];
  nextId: number;
}

const DEFAULT: CalcState = {
  display: '0',
  expression: '',
  history: [],
  nextId: 1,
};

function statePath(): string {
  return resolveGlobalStatePath('calc');
}

function safeEval(expr: string): string {
  // Allow numbers, operators, parens, decimal points, spaces, and common math funcs
  const sanitised = expr.replace(/\s/g, '');

  // Support named functions: sqrt, sin, cos, tan, log, abs, ceil, floor, round, pow, min, max, PI, E
  const withMath = sanitised
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\blog\b/g, 'Math.log')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\bceil\b/g, 'Math.ceil')
    .replace(/\bfloor\b/g, 'Math.floor')
    .replace(/\bround\b/g, 'Math.round')
    .replace(/\bpow\b/g, 'Math.pow')
    .replace(/\bmin\b/g, 'Math.min')
    .replace(/\bmax\b/g, 'Math.max')
    .replace(/\bPI\b/g, 'Math.PI')
    .replace(/\bE\b/g, 'Math.E');

  // After replacing math functions, validate: only allow Math.xxx, digits, operators, parens
  if (!/^[a-zA-Z.\d+\-*/().%^,\s]+$/.test(withMath)) {
    throw new Error(`Invalid expression: ${expr}`);
  }

  // Ensure no unexpected identifiers (only Math.xxx allowed)
  const stripped = withMath.replace(/Math\.\w+/g, '0').replace(/[\d.+\-*/()%^,\s]/g, '');
  if (stripped.length > 0) {
    throw new Error(`Invalid expression: ${expr}`);
  }

  // Replace ^ with ** for exponentiation
  const jsExpr = withMath.replace(/\^/g, '**');

  const fn = new Function(`"use strict"; return (${jsExpr});`);
  const result = fn() as number;

  if (!Number.isFinite(result)) {
    throw new Error('Result is not a finite number');
  }

  return Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(10)).toString();
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0];
  if (!action) throw new Error('No action or expression specified. Run \'sero help calc\' for usage.');

  const fp = statePath();

  // sero calc history
  if (action === 'history') {
    const state = await readState<CalcState>(fp, DEFAULT);
    if (state.history.length === 0) {
      process.stdout.write('No calculation history.\n');
      return;
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({ history: state.history.slice(0, 20) }, null, 2) + '\n');
      return;
    }
    const lines = state.history
      .slice(0, 20)
      .map((h) => `${h.expression} = ${h.result}`);
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  // sero calc clear
  if (action === 'clear') {
    await writeState(fp, { ...DEFAULT });
    process.stdout.write('Calculator cleared.\n');
    return;
  }

  // sero calc <expression>  or  sero calc evaluate <expression>
  let expression: string;
  if (action === 'evaluate') {
    expression = args.slice(1).join(' ').trim();
  } else {
    // The whole args is the expression
    expression = args.join(' ').trim();
  }

  if (!expression) throw new Error('Expression is required.');

  const result = safeEval(expression);
  const state = await readState<CalcState>(fp, DEFAULT);
  const entry: HistoryEntry = {
    id: state.nextId,
    expression,
    result,
    createdAt: new Date().toISOString(),
  };
  state.history.unshift(entry);
  state.nextId++;
  state.display = result;
  state.expression = expression;
  await writeState(fp, state);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ expression, result }, null, 2) + '\n');
  } else {
    process.stdout.write(`${expression} = ${result}\n`);
  }
}

export const calcCommand: CommandDef = {
  description: 'Evaluate math expressions',
  helpText: `Evaluate math expressions with history tracking.

USAGE
  sero calc <expression>
  sero calc evaluate <expression>
  sero calc history
  sero calc clear

ACTIONS
  <expression>        Evaluate a math expression (default action)
  evaluate <expr>     Evaluate a math expression (explicit)
  history             Show recent calculations (last 20)
  clear               Clear calculator history

SUPPORTED OPERATIONS
  Basic:    + - * / % ^
  Functions: sqrt, sin, cos, tan, log, abs, ceil, floor, round, pow, min, max
  Constants: PI, E

FLAGS
  --json              Output as JSON

EXAMPLES
  sero calc "2 + 3 * 4"
  sero calc "sqrt(144) + 2^3"
  sero calc "sin(PI/2)"
  sero calc history
  sero calc clear`,
  run,
};
