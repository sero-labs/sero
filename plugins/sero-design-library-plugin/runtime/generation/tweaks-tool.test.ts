import { describe, expect, it } from 'vitest';

import type { EmittedFile } from '../../shared/targets';
import { invokeTool } from '../librarian/test-support';
import { createDeclareTweaksTool } from './tweaks-tool';

/**
 * The tool answers twice about the same declaration, and the two answers are for
 * different audiences: the model is told immediately, so it can fix the page it
 * is still writing, and the runtime asks again at the end, because between those
 * two moments the page can change out from under the controls.
 */

const CONTROL = {
  id: 'display-scale',
  group: 'Typography',
  label: 'Display scale',
  cssVariable: '--display-scale',
  type: 'range',
  defaultValue: '34',
  min: 24,
  max: 64,
  step: 1,
  unit: 'px',
};

const PAGE = `<style>:root { --display-scale: 34px; } h1 { font-size: var(--display-scale); }</style>`;
const PAGE_WITHOUT = `<style>h1 { font-size: 34px; }</style>`;

function toolOver(files: EmittedFile[]) {
  // The array is mutated by the tests, exactly as the emitter's would be.
  return { tool: createDeclareTweaksTool(() => files), files };
}

describe('declaring the controls for a page', () => {
  it('accepts a control the page declares and reads', async () => {
    const { tool } = toolOver([{ name: 'index.html', content: PAGE }]);

    await invokeTool(tool.definition, { controls: [CONTROL] });

    expect(tool.result()?.manifest.controls.map((entry) => entry.id)).toEqual(['display-scale']);
    expect(tool.result()?.dropped).toEqual([]);
  });

  it('tells the model when a valid page-specific control lacks the baseline', async () => {
    const { tool } = toolOver([{ name: 'index.html', content: PAGE }]);

    const result = await invokeTool(tool.definition, { controls: [CONTROL] });
    const message = result.content.find((entry) => entry.type === 'text');

    expect(result.details).toMatchObject({ ok: false });
    expect(message && 'text' in message ? message.text : '').toContain('Baseline not accepted');
  });

  it('says nothing at all when it was never called', () => {
    const { tool } = toolOver([{ name: 'index.html', content: PAGE }]);

    expect(tool.result()).toBeNull();
  });

  it('refuses to bind controls before any file exists', async () => {
    const { tool } = toolOver([]);

    const result = await invokeTool(tool.definition, { controls: [CONTROL] });

    expect('isError' in result && result.isError).toBe(true);
    expect(tool.result()).toBeNull();
  });

  it('drops a control the finished page no longer supports', async () => {
    // The hole this closes: declare the controls, then rewrite the stylesheet.
    // Validated once, the manifest would keep a control for a property that is
    // gone — and bake that property into the preview's allow-list.
    const { tool, files } = toolOver([{ name: 'index.html', content: PAGE }]);

    await invokeTool(tool.definition, { controls: [CONTROL] });
    expect(tool.result()?.manifest.controls).toHaveLength(1);

    files[0] = { name: 'index.html', content: PAGE_WITHOUT };

    expect(tool.result()?.manifest.controls).toEqual([]);
    expect(tool.result()?.dropped[0]?.reason).toContain('never declares');
  });

  it('keeps a control the page grew the property for afterwards', async () => {
    // The same rule read the other way: a run told its control was inert can add
    // the property and be believed, without declaring the controls again.
    const { tool, files } = toolOver([{ name: 'index.html', content: PAGE_WITHOUT }]);

    await invokeTool(tool.definition, { controls: [CONTROL] });
    expect(tool.result()?.manifest.controls).toEqual([]);

    files[0] = { name: 'index.html', content: PAGE };

    expect(tool.result()?.manifest.controls).toHaveLength(1);
  });
});
