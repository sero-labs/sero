import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveHostArtifactsRoot, resolveSeroRoot } from '@electron/features/profile/roots';

const ENV_KEYS = [
  'VITEST',
  'NODE_ENV',
  'SERO_FIXED_ROOT_OVERRIDE',
  'SERO_HOME_OVERRIDE',
  'SERO_HOST_ARTIFACTS_ROOT_OVERRIDE',
] as const;

describe('Sero root resolution', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.VITEST = '1';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('refuses the Sero root under a test runner without an override', () => {
    expect(() => resolveSeroRoot()).toThrow(/SERO_FIXED_ROOT_OVERRIDE or SERO_HOME_OVERRIDE/);
  });

  it('refuses the host artifacts root under a test runner without an override', () => {
    expect(() => resolveHostArtifactsRoot()).toThrow(
      /SERO_FIXED_ROOT_OVERRIDE or SERO_HOST_ARTIFACTS_ROOT_OVERRIDE/,
    );
  });

  it('accepts SERO_HOME_OVERRIDE under a test runner', () => {
    process.env.SERO_HOME_OVERRIDE = '/tmp/sero-home';
    expect(resolveSeroRoot()).toBe(path.resolve('/tmp/sero-home'));
  });

  it('accepts SERO_HOST_ARTIFACTS_ROOT_OVERRIDE under a test runner', () => {
    process.env.SERO_HOST_ARTIFACTS_ROOT_OVERRIDE = '/tmp/sero-host';
    expect(resolveHostArtifactsRoot()).toBe(path.resolve('/tmp/sero-host'));
  });

  it('prefers SERO_FIXED_ROOT_OVERRIDE under a test runner', () => {
    process.env.SERO_FIXED_ROOT_OVERRIDE = '/tmp/sero-fixed';
    process.env.SERO_HOME_OVERRIDE = '/tmp/sero-home';
    expect(resolveSeroRoot()).toBe(path.resolve('/tmp/sero-fixed'));
    expect(resolveHostArtifactsRoot()).toBe(path.resolve('/tmp/sero-fixed'));
  });

  it('falls back to the home directory outside a test runner', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    expect(resolveSeroRoot()).toBe(path.join(os.homedir(), '.sero-ui'));
    expect(resolveHostArtifactsRoot()).toBe(path.join(os.homedir(), '.sero-ui'));
  });

  it('treats NODE_ENV=test as a test runner', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'test';
    expect(() => resolveSeroRoot()).toThrow(/test runner/);
  });
});
