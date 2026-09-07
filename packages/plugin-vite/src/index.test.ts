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

  it('rewrites :root/:host/html/body document selectors to :scope', () => {
    const out = scopePluginCss(
      ':root, :host { --spacing: .25rem } html, body { margin: 0 }',
      { pluginId: 'admin' },
    );
    expect(out).toContain(':scope,:scope { --spacing: .25rem }');
    expect(out).toContain(':scope,:scope { margin: 0 }');
    expect(out).not.toMatch(/(^|[\s,{])(:root|:host|html|body)([\s,{])/);
  });

  it('only rewrites selectors, never declaration values or strings', () => {
    const out = scopePluginCss('.badge::before { content: ":root html body" }', { pluginId: 'admin' });
    // The property value must survive verbatim; only the selector is scoped.
    expect(out).toContain('content: ":root html body"');
    expect(out).toContain('.badge::before');
  });

  it('leaves dark-variant ancestor conditions intact', () => {
    const out = scopePluginCss('.x:is(.dark *) { color: red }', { pluginId: 'admin' });
    expect(out).toContain('.x:is(.dark *) { color: red }');
  });

  it('rejects compound/functional document selectors instead of corrupting them', () => {
    expect(() => scopePluginCss('html.dark .x { color: red }', { pluginId: 'admin' }))
      .toThrow(/document selector/);
    expect(() => scopePluginCss(':host(.compact) .x { color: red }', { pluginId: 'admin' }))
      .toThrow(/document selector/);
  });

  it('rejects nested or multi-document selectors, not just immediate compounds', () => {
    // Nested in a functional pseudo, and combined across combinators.
    expect(() => scopePluginCss(':not(:root) .x { color: red }', { pluginId: 'admin' }))
      .toThrow(/document selector/);
    expect(() => scopePluginCss('html > body .x { color: red }', { pluginId: 'admin' }))
      .toThrow(/document selector/);
  });

  it('rewrites document selectors case-insensitively', () => {
    const out = scopePluginCss(':ROOT { --x: 1 } HTML, BODY { margin: 0 }', { pluginId: 'admin' });
    expect(out).toContain(':scope { --x: 1 }');
    expect(out).toContain(':scope,:scope { margin: 0 }');
  });

  it('rejects runtime @import in any letter case', () => {
    expect(() => scopePluginCss('@import url("https://fonts.example/f.css");\n.x {}', { pluginId: 'admin' }))
      .toThrow(/@import/);
    expect(() => scopePluginCss('@IMPORT url("https://fonts.example/f.css");\n.x {}', { pluginId: 'admin' }))
      .toThrow(/@import/);
  });

  it('drops @charset rather than moving it inside the scope', () => {
    const out = scopePluginCss('@charset "utf-8";\n.x { color: red }', { pluginId: 'admin' });
    expect(out).not.toMatch(/@charset/i);
    expect(out).toContain('.x { color: red }');
  });

  it('rejects invalid plugin IDs', () => {
    expect(() => seroPluginCssScope({ pluginId: 'Admin App' })).toThrow('Invalid plugin ID');
  });

  it('leaves ?raw and ?url imports of a stylesheet alone: they are JS modules, not CSS', () => {
    const plugin = seroPluginCssScope({ pluginId: 'admin' });
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const wrapped = 'export default "html.theme-glass body { color: red }"';
    expect(transform.call({}, wrapped, '/pkg/globals.css?raw')).toBeNull();
    expect(transform.call({}, wrapped, '/pkg/globals.css?url')).toBeNull();
    expect(transform.call({}, '.x { color: red }', '/pkg/app.css?t=123')).not.toBeNull();
  });
});
