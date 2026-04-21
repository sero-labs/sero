import { describe, expect, it } from 'vitest';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { normalizeResourcePreview } from '../runtime/runtime-resource';

function createResult(contents: Array<Record<string, unknown>>): ReadResourceResult {
  return { contents } as unknown as ReadResourceResult;
}

describe('normalizeResourcePreview', () => {
  it('renders HTML resource previews from MCP UI resources', () => {
    const preview = normalizeResourcePreview('demo', 'ui://demo/app', createResult([
      {
        uri: 'ui://demo/app',
        mimeType: 'text/html;profile=mcp-app',
        text: '<html><body>Hello</body></html>',
      },
    ]));

    expect(preview.previewKind).toBe('html');
    expect(preview.html).toContain('Hello');
  });

  it('pretty-prints JSON resource previews', () => {
    const preview = normalizeResourcePreview('demo', 'file://config.json', createResult([
      {
        uri: 'file://config.json',
        mimeType: 'application/json',
        text: '{"ok":true}',
      },
    ]));

    expect(preview.previewKind).toBe('json');
    expect(preview.text).toContain('"ok": true');
  });

  it('returns data URLs for image blobs', () => {
    const preview = normalizeResourcePreview('demo', 'file://diagram.png', createResult([
      {
        uri: 'file://diagram.png',
        mimeType: 'image/png',
        blob: Buffer.from('png-data').toString('base64'),
      },
    ]));

    expect(preview.previewKind).toBe('image');
    expect(preview.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('falls back to binary preview when no text payload exists', () => {
    const preview = normalizeResourcePreview('demo', 'file://archive.bin', createResult([
      {
        uri: 'file://archive.bin',
        mimeType: 'application/octet-stream',
        blob: Buffer.from('binary').toString('base64'),
      },
    ]));

    expect(preview.previewKind).toBe('binary');
    expect(preview.text).toBeUndefined();
  });
});
