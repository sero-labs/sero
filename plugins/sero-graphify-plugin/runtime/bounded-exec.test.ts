import { describe, expect, it } from 'vitest';
import { boundedExec, OUTPUT_LIMIT_EXIT_CODE, TIMEOUT_EXIT_CODE } from './bounded-exec';

describe('boundedExec', () => {
  it('captures stdout/stderr and exit code', async () => {
    const result = await boundedExec('sh', ['-c', 'echo out; echo err >&2; exit 3']);
    expect(result.stdout.trim()).toBe('out');
    expect(result.stderr.trim()).toBe('err');
    expect(result.exitCode).toBe(3);
  });

  it('kills and reports when output exceeds the cap', async () => {
    const result = await boundedExec('sh', ['-c', 'yes x | head -c 100000'], { maxOutputBytes: 1024 });
    expect(result.exitCode).toBe(OUTPUT_LIMIT_EXIT_CODE);
  });

  it('kills and reports on timeout', async () => {
    const result = await boundedExec('sleep', ['5'], { timeoutMs: 200 });
    expect(result.exitCode).toBe(TIMEOUT_EXIT_CODE);
  });

  it('reports missing binaries as failures, not throws', async () => {
    const result = await boundedExec('/nonexistent/binary', []);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('ENOENT');
  });

  it('streams complete stdout lines to onLine', async () => {
    const lines: string[] = [];
    await boundedExec('sh', ['-c', 'echo first; echo second; printf "no-newline-tail"'], {
      onLine: (line) => lines.push(line),
    });
    expect(lines).toEqual(['first', 'second']); // partial last line is not emitted
  });

  it('never lets a throwing onLine break the exec', async () => {
    const result = await boundedExec('sh', ['-c', 'echo boom; exit 0'], {
      onLine: () => {
        throw new Error('listener bug');
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('boom');
  });
});

const node = process.execPath;
/** Print more than the limit, then exit cleanly. */
const chatty = (bytes: number) => [
  '-e',
  `const line='x'.repeat(1000)+'\\n';for(let i=0;i<${Math.ceil(bytes / 1000)};i++)process.stdout.write(line);process.stdout.write('done\\n');`,
];

describe('boundedExec output limits', () => {
  it('kills a short probe that will not stop talking', async () => {
    const result = await boundedExec(node, chatty(200_000), { maxOutputBytes: 50_000 });
    expect(result.exitCode).toBe(OUTPUT_LIMIT_EXIT_CODE);
  });

  it('lets a chatty build finish, keeping the tail', async () => {
    // The tokens are already spent by the time a long extract has printed a
    // megabyte of progress. Killing it there throws away a finished
    // build and makes it look like one that never ran.
    const result = await boundedExec(node, chatty(200_000), {
      maxOutputBytes: 50_000,
      onOutputLimit: 'truncate',
    });
    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(50_000);
    // The tail is what diagnoses a build, and it holds the summary line.
    expect(result.stdout).toContain('done');
  });

  it('leaves small output whole', async () => {
    const result = await boundedExec(node, ['-e', 'process.stdout.write("hello\\n")'], { onOutputLimit: 'truncate' });
    expect(result).toMatchObject({ exitCode: 0, stdout: 'hello\n', truncated: false });
  });
});
