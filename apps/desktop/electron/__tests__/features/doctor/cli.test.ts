import { describe, expect, it } from 'vitest';
import { parseDoctorArgs, runDoctorSafeMode } from '@electron/features/doctor/cli';

describe('parseDoctorArgs', () => {
  it('accepts the empty argv (full run, no JSON)', () => {
    const result = parseDoctorArgs([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flags.json).toBe(false);
      expect(result.flags.quick).toBe(false);
      expect(result.flags.allProfiles).toBe(false);
    }
  });

  it('parses simple boolean flags', () => {
    const result = parseDoctorArgs(['--quick', '--json', '--all-profiles']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flags.quick).toBe(true);
      expect(result.flags.json).toBe(true);
      expect(result.flags.allProfiles).toBe(true);
    }
  });

  it('parses --profile, --category, --report values', () => {
    const result = parseDoctorArgs([
      '--profile',
      'work',
      '--category',
      'profile',
      '--report',
      '/tmp/x.json',
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flags.profileFilter).toBe('work');
      expect(result.flags.category).toBe('profile');
      expect(result.flags.reportPath).toBe('/tmp/x.json');
      // --report implies --json.
      expect(result.flags.json).toBe(true);
    }
  });

  it('rejects --profile with no value', () => {
    const result = parseDoctorArgs(['--profile']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--profile requires/);
  });

  it('rejects --profile when the next token is another flag', () => {
    const result = parseDoctorArgs(['--profile', '--json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--profile requires/);
  });

  it('rejects --category with an unknown name', () => {
    const result = parseDoctorArgs(['--category', 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown --category/);
  });

  it('rejects --report with no path', () => {
    const result = parseDoctorArgs(['--report']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--report requires/);
  });

  it('rejects unknown flags', () => {
    const result = parseDoctorArgs(['--what']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown flag --what/);
  });

  it('rejects positional arguments', () => {
    const result = parseDoctorArgs(['stray']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unexpected positional/);
  });

  it('treats --doctor itself as a no-op flag', () => {
    const result = parseDoctorArgs(['--doctor', '--quick']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.flags.quick).toBe(true);
  });
});

describe('runDoctorSafeMode parse-error path', () => {
  it('exits 2 and prints usage on a parse error before running checks', async () => {
    const logs: string[] = [];
    const result = await runDoctorSafeMode({
      argv: ['--profile'],
      seroVersion: '0.0.0',
      log: (line) => logs.push(line),
    });
    expect(result.exitCode).toBe(2);
    expect(result.parseError).toMatch(/--profile requires/);
    expect(result.report).toBeUndefined();
    expect(logs.some((line) => line.includes('Usage:'))).toBe(true);
  });
});
