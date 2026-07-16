import { describe, expect, it } from 'vitest';
import { scopePluginCss, seroPluginCssScope } from './index';

describe('scopePluginCss', () => {
  it('wraps plugin CSS with an exact, bounded scope', () => {
    expect(scopePluginCss('.flex { display: flex }', { pluginId: 'admin' }))
      .toContain('@scope ([data-sero-plugin="admin"]) to ([data-sero-plugin])');
  });

  it('does not wrap CSS twice', () => {
    const once = scopePluginCss('.flex {}', { pluginId: 'admin' });
    expect(scopePluginCss(once, { pluginId: 'admin' })).toBe(once);
  });

  it.each([':root { --x: 1 }', 'html.dark {}', 'body > main {}'])(
    'rejects document selector %s',
    (css) => expect(() => scopePluginCss(css, { pluginId: 'admin' })).toThrow('selector'),
  );

  it('rejects invalid plugin IDs', () => {
    expect(() => seroPluginCssScope({ pluginId: 'Admin App' })).toThrow('Invalid plugin ID');
  });
});
