import { describe, expect, it } from 'vitest';
import { shouldBridgePluginTools } from '@electron/features/subagent/runtime/resource-loader';

describe('shouldBridgePluginTools', () => {
  it('bridges for a default subagent', () => {
    expect(shouldBridgePluginTools('all', undefined, new Set())).toBe(true);
    expect(shouldBridgePluginTools('all', [], new Set())).toBe(true);
  });

  it('keeps tools direct when an allowlist approves them by name', () => {
    expect(shouldBridgePluginTools('all', ['web_search'], new Set())).toBe(false);
  });

  it('does not bridge when the session cannot run sero-cli', () => {
    expect(shouldBridgePluginTools('all', undefined, new Set(['sero-cli']))).toBe(false);
    expect(shouldBridgePluginTools('none', undefined, new Set())).toBe(false);
    expect(shouldBridgePluginTools('readOnly', undefined, new Set())).toBe(false);
  });
});
