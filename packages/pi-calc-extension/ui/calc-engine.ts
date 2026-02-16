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

/** Safe math evaluation — returns result string or throws */
export function evaluate(expression: string): string {
  const jsExpr = toMathExpr(expression);
  const sanitised = jsExpr.replace(/\s/g, '');

  if (!/^[\d+\-*/().%]+$/.test(sanitised)) {
    throw new Error('Invalid expression');
  }

  const fn = new Function(`"use strict"; return (${sanitised});`);
  const result = fn() as number;

  if (!Number.isFinite(result)) {
    throw new Error('Error');
  }

  return formatResult(result);
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
