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

  it('rewrites :root/:host theme carriers to :scope so vars self-contain', () => {
    const out = scopePluginCss(':root, :host { --spacing: .25rem }', { pluginId: 'admin' });
    expect(out).toContain(':scope, :scope { --spacing: .25rem }');
    expect(out).not.toMatch(/:root|:host/);
  });

  it('does not touch dark-variant or nested :root-like idents', () => {
    // .dark ancestor conditions and custom idents must survive verbatim.
    const out = scopePluginCss('.x:is(.dark *) { color: red } .rootish {}', { pluginId: 'admin' });
    expect(out).toContain('.x:is(.dark *) { color: red }');
    expect(out).toContain('.rootish {}');
  });

  it('hoists leading @import/@charset above the scope wrapper', () => {
    const out = scopePluginCss(
      '@charset "utf-8";\n@import url("https://fonts.example/f.css");\n.x {}',
      { pluginId: 'admin' },
    );
    // @charset stays at byte 0; both at-rules precede @scope.
    expect(out.indexOf('@charset')).toBe(0);
    expect(out.indexOf('@import')).toBeLessThan(out.indexOf('@scope'));
    // The style rule remains inside the scope.
    expect(out).toMatch(/@scope[^]*\.x \{\}/);
  });

  it('rejects invalid plugin IDs', () => {
    expect(() => seroPluginCssScope({ pluginId: 'Admin App' })).toThrow('Invalid plugin ID');
  });
});
