import { describe, expect, it } from 'vitest';
import {
  assertSameWslDistroForAdditionalRoots,
  canonicalizeWslExecutionPath,
  extractWslDistro,
  isWslPathInsideRoot,
  toWslPath,
} from '@electron/features/workspace/runtime/backends/host/wsl-paths';

describe('wsl path utilities', () => {
  it('translates drive-letter paths to lowercase /mnt drive paths', () => {
    expect(toWslPath('C:\\Users\\me\\repo')).toBe('/mnt/c/Users/me/repo');
    expect(toWslPath('c:\\Users\\me\\repo')).toBe('/mnt/c/Users/me/repo');
    expect(toWslPath('D:/Work/Sero Repo')).toBe('/mnt/d/Work/Sero Repo');
  });

  it('translates both WSL UNC prefixes to distro-local execution paths', () => {
    expect(toWslPath('\\\\wsl$\\Ubuntu\\home\\me\\repo')).toBe('/home/me/repo');
    expect(toWslPath('\\\\wsl.localhost\\Debian\\home\\me\\Sero Repo')).toBe('/home/me/Sero Repo');
    expect(extractWslDistro('\\\\wsl.localhost\\Debian\\home\\me')).toBe('Debian');
  });

  it('normalizes backslashes, spaces, and traversal segments in execution paths', () => {
    expect(toWslPath('C:\\Users\\me\\repo\\folder with spaces\\..\\src')).toBe('/mnt/c/Users/me/repo/src');
    expect(canonicalizeWslExecutionPath('/mnt/C/Users/me/repo/./sub/../file.ts')).toBe('/mnt/c/Users/me/repo/file.ts');
    expect(toWslPath('\\\\wsl$\\Ubuntu\\home\\me\\repo\\..\\other')).toBe('/home/me/other');
  });

  it('checks containment after canonicalizing native and execution-side paths', () => {
    expect(isWslPathInsideRoot('/mnt/c/Users/me/repo/sub', 'C:\\Users\\me\\repo')).toBe(true);
    expect(isWslPathInsideRoot('C:\\Users\\me\\repo\\sub', 'c:\\Users\\me\\repo')).toBe(true);
  });

  it('rejects traversal attempts that escape the root after canonicalization', () => {
    expect(isWslPathInsideRoot('C:\\Users\\me\\repo\\..\\other', 'C:\\Users\\me\\repo')).toBe(false);
    expect(isWslPathInsideRoot('/mnt/c/Users/me/repository', 'C:\\Users\\me\\repo')).toBe(false);
  });

  it('does not treat a WSL UNC path as inside a Windows drive root', () => {
    expect(isWslPathInsideRoot('\\\\wsl$\\Ubuntu\\home\\me\\other', 'C:\\Users\\me\\repo')).toBe(false);
  });

  it('rejects mixed WSL distro additional roots while allowing same-distro and drive roots', () => {
    expect(() =>
      assertSameWslDistroForAdditionalRoots('\\\\wsl$\\Ubuntu\\home\\me\\repo', [
        '\\\\wsl.localhost\\ubuntu\\home\\me\\other',
        'C:\\Users\\me\\shared',
      ]),
    ).not.toThrow();

    expect(() =>
      assertSameWslDistroForAdditionalRoots('\\\\wsl$\\Ubuntu\\home\\me\\repo', [
        '\\\\wsl$\\Debian\\home\\me\\other',
      ]),
    ).toThrow(/Mixed WSL distros are not supported/);
  });
});
