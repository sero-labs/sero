import { describe, it, expect } from 'vitest';
import { createJsonSchemaCliAdapter } from '@electron/cli/core';

/**
 * Mirrors the coerceValue + schemaToParams logic from schema-bridge.ts.
 * Extracted here so array/object JSON coercion is testable in isolation.
 */

interface SchemaProp {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

function coerceValue(value: string | true, prop: SchemaProp): unknown {
  if (value === true) return true;
  if (prop.type === 'number' || prop.type === 'integer') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (prop.type === 'boolean') {
    return value === 'true' || value === '1';
  }
  if (prop.type === 'array' || prop.type === 'object') {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value; }
    }
  }
  return value;
}

describe('coerceValue', () => {
  it('coerces string values unchanged', () => {
    const prop: SchemaProp = { name: 'x', type: 'string', description: '', required: true };
    expect(coerceValue('hello', prop)).toBe('hello');
  });

  it('coerces number values', () => {
    const prop: SchemaProp = { name: 'x', type: 'number', description: '', required: true };
    expect(coerceValue('42', prop)).toBe(42);
  });

  it('coerces boolean values', () => {
    const prop: SchemaProp = { name: 'x', type: 'boolean', description: '', required: false };
    expect(coerceValue('true', prop)).toBe(true);
    expect(coerceValue('1', prop)).toBe(true);
    expect(coerceValue('false', prop)).toBe(false);
  });

  it('parses JSON arrays', () => {
    const prop: SchemaProp = { name: 'options', type: 'array', description: '', required: true };
    const input = '[{"label":"Red"},{"label":"Blue"}]';
    const result = coerceValue(input, prop);
    expect(result).toEqual([{ label: 'Red' }, { label: 'Blue' }]);
  });

  it('parses JSON objects', () => {
    const prop: SchemaProp = { name: 'config', type: 'object', description: '', required: false };
    const input = '{"key":"value","nested":{"a":1}}';
    const result = coerceValue(input, prop);
    expect(result).toEqual({ key: 'value', nested: { a: 1 } });
  });

  it('falls back to raw string for invalid JSON on array type', () => {
    const prop: SchemaProp = { name: 'x', type: 'array', description: '', required: true };
    expect(coerceValue('not json', prop)).toBe('not json');
  });

  it('falls back to raw string for invalid JSON on object type', () => {
    const prop: SchemaProp = { name: 'x', type: 'object', description: '', required: true };
    expect(coerceValue('{bad', prop)).toBe('{bad');
  });

  it('handles boolean true (bare flag)', () => {
    const prop: SchemaProp = { name: 'verbose', type: 'boolean', description: '', required: false };
    expect(coerceValue(true, prop)).toBe(true);
  });
});

describe('cached MCP JSON Schema CLI adapter', () => {
  it('maps safe object schemas to flags and typed values', () => {
    const adapter = createJsonSchemaCliAdapter('portable/deploy/release', 'Create a release', {
      type: 'object',
      properties: {
        environment: { type: 'string', description: 'Target environment' },
        dryRun: { type: 'boolean' },
      },
      required: ['environment'],
    });
    expect(adapter.jsonMode).toBe(false);
    expect(adapter.parse(['staging', '--dryRun'])).toEqual({ environment: 'staging', dryRun: true });
    expect(adapter.help).toContain('sero portable/deploy/release <environment>');
  });

  it('uses explicit JSON mode for unsupported compound schemas', () => {
    const adapter = createJsonSchemaCliAdapter('portable/deploy/release', 'Create a release', {
      oneOf: [{ type: 'object' }, { type: 'string' }],
    });
    expect(adapter.jsonMode).toBe(true);
    expect(adapter.parse(['{"environment":"staging"}'])).toEqual({ environment: 'staging' });
    expect(() => adapter.parse(['[]'])).toThrow('must be a JSON object');
  });
});
