import { mkdirSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_HOME: '/tmp/sero-home',
}));

import {
  buildDockerMounts,
  formatMount,
  normalizeDockerSource,
} from '@electron/features/workspace/runtime/backends/docker/docker-mounts';
import { toRuntimeIdentityMountPath } from '@electron/features/workspace/runtime/runtime-paths';

describe('normalizeDockerSource', () => {
  it('returns POSIX paths unchanged', () => {
    expect(normalizeDockerSource('/Users/dev/workspace', 'darwin')).toBe('/Users/dev/workspace');
    expect(normalizeDockerSource('/home/dev/workspace', 'linux')).toBe('/home/dev/workspace');
  });

  it('rewrites Windows host paths to forward-slash form', () => {
    expect(normalizeDockerSource('C:\\Users\\dev\\workspace', 'win32')).toBe('C:/Users/dev/workspace');
    expect(normalizeDockerSource('D:\\projects\\repo', 'win32')).toBe('D:/projects/repo');
  });

  it('leaves Windows-style strings alone on non-Windows platforms', () => {
    // We never expect this combination in practice; the guard preserves invariants for tests
    // that exercise both code paths from a single OS.
    expect(normalizeDockerSource('C:\\foo', 'linux')).toBe('C:\\foo');
  });
});

describe('formatMount', () => {
  it('emits a comma-separated bind spec', () => {
    expect(formatMount({ source: '/host', target: '/workspace' }))
      .toBe('type=bind,source=/host,target=/workspace');
  });

  it('marks readonly mounts', () => {
    expect(formatMount({ source: '/host', target: '/ro', readonly: true }))
      .toBe('type=bind,source=/host,target=/ro,readonly');
  });

  it('refuses sources containing a comma to avoid CSV ambiguity', () => {
    expect(() => formatMount({ source: '/host,evil', target: '/workspace' }))
      .toThrow(/cannot contain a comma/);
  });
});

describe('buildDockerMounts', () => {
  it('normalizes Windows host paths and dedupes by normalized source', () => {
    mkdirSync('/tmp/sero-agent/skills', { recursive: true });
    mkdirSync('/tmp/sero-agent/prompts', { recursive: true });

    const mounts = buildDockerMounts(
      {
        workspaceId: 'ws-1',
        hostPath: 'C:\\Users\\dev\\workspace',
        readOnlyMounts: ['/tmp/sero-agent/skills', '/tmp/sero-agent/prompts'],
        writableMounts: [],
      },
      'win32',
    );

    expect(mounts[0]).toEqual({ source: 'C:/Users/dev/workspace', target: '/workspace' });
  });

  it('maps Windows additional roots to the Linux bind target used inside Docker', () => {
    expect(toRuntimeIdentityMountPath('D:\\projects\\linked-root')).toBe('/mnt/d/projects/linked-root');
  });
});
