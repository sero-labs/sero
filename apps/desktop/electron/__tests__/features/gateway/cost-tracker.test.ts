import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { CostTracker } from '@electron/features/gateway/server/cost-tracker';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-gateway-cost-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('gateway cost tracker config loading', () => {
  it('does not overwrite malformed config files and surfaces a load error', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'gateway-config.json');
    fs.writeFileSync(configPath, '{ malformed-json', 'utf8');

    const tracker = new CostTracker(configDir);

    expect(fs.readFileSync(configPath, 'utf8')).toBe('{ malformed-json');
    expect(tracker.getSummary().dailyLimit).toBe(50);
    expect(tracker.getConfigLoadError()).toContain('Invalid JSON');
  });

  it('writes defaults when config file is missing', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'gateway-config.json');

    const tracker = new CostTracker(configDir);

    expect(fs.existsSync(configPath)).toBe(true);
    expect(tracker.getConfigLoadError()).toBeNull();
    expect(tracker.getSummary().dailyLimit).toBe(50);

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(persisted.maxCostPerSession).toBe(5);
    expect(persisted.maxCostPerDay).toBe(50);
    expect(persisted.maxConcurrentSessions).toBe(10);
  });
});
