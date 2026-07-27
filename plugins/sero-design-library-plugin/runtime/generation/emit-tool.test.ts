import { describe, expect, it } from 'vitest';

import { MAX_FILES, MAX_FILE_BYTES } from '../../shared/targets';
import { invokeTool } from '../librarian/test-support';
import { createEmitFileTool, refuseEmittedSet } from './emit-tool';

/**
 * The emit tool is where a generation run meets the target contract. Every
 * refusal here is written to be read by the model, because the alternative is a
 * build failure minutes later with nothing it can act on.
 */

function write(tool: ReturnType<typeof createEmitFileTool>, name: string, content: string) {
  return invokeTool(tool.definition, { name, content });
}

function textOf(result: { content: Array<{ type: string }> }): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

describe('writing a file', () => {
  it('accepts a page and keeps the order it was written in', async () => {
    const tool = createEmitFileTool('html');

    await write(tool, 'index.html', '<body>x</body>');
    await write(tool, 'styles.css', 'body{}');

    expect(tool.files().map((file) => file.name)).toEqual(['index.html', 'styles.css']);
    expect(tool.refusals()).toEqual([]);
  });

  it('lets a second write replace the first', async () => {
    const tool = createEmitFileTool('html');

    await write(tool, 'index.html', '<body>first</body>');
    await write(tool, 'index.html', '<body>second</body>');

    expect(tool.files()).toHaveLength(1);
    expect(tool.files()[0]?.content).toContain('second');
  });

  it('refuses a name that would leave the revision directory', async () => {
    const tool = createEmitFileTool('html');

    for (const name of ['../escape.html', 'nested/index.html', '.hidden.html', '/abs.html']) {
      const result = await write(tool, name, '<body>x</body>');
      expect(textOf(result), name).toContain('not a usable file name');
    }
    expect(tool.files()).toEqual([]);
  });

  it('refuses a file type the target does not use', async () => {
    const html = createEmitFileTool('html');
    const react = createEmitFileTool('react');

    expect(textOf(await write(html, 'App.tsx', 'export default 1'))).toContain('not a file this target uses');
    expect(textOf(await write(react, 'index.html', '<body>x</body>'))).toContain(
      'not a file this target uses',
    );
  });

  it('refuses an empty file', async () => {
    const tool = createEmitFileTool('html');
    expect(textOf(await write(tool, 'index.html', '   \n '))).toContain('is empty');
  });

  it('refuses a file over the size limit', async () => {
    const tool = createEmitFileTool('html');
    const result = await write(tool, 'index.html', 'x'.repeat(MAX_FILE_BYTES + 1));

    expect(textOf(result)).toContain('over the');
    expect(tool.files()).toEqual([]);
  });

  it('refuses more files than a design may have', async () => {
    const tool = createEmitFileTool('html');
    for (let index = 0; index < MAX_FILES; index += 1) {
      await write(tool, `part${index}.css`, 'body{}');
    }

    const result = await write(tool, 'overflow.css', 'body{}');

    expect(textOf(result)).toContain(`at most ${MAX_FILES} files`);
    expect(tool.files()).toHaveLength(MAX_FILES);
  });
});

describe('refusing what the preview cannot run', () => {
  it('names the unapproved import and what may be used instead', async () => {
    const tool = createEmitFileTool('react');

    const result = await write(
      tool,
      'App.tsx',
      `import { motion } from 'framer-motion';\nexport default function App() { return <motion.div />; }`,
    );

    expect(textOf(result)).toContain('framer-motion');
    expect(textOf(result)).toContain('`react`');
    expect(tool.files()).toEqual([]);
    expect(tool.refusals()).toEqual(['App.tsx']);
  });

  it('allows the approved packages and a subpath of one', async () => {
    const tool = createEmitFileTool('react');

    await write(
      tool,
      'App.tsx',
      `import { useState } from 'react';\nimport { Activity } from 'lucide-react';\nimport { Panel } from './Panel';\nexport default function App() { return <Panel />; }`,
    );

    expect(tool.files()).toHaveLength(1);
  });

  it('tells the HTML target it has no imports at all', async () => {
    const tool = createEmitFileTool('html');

    const result = await write(tool, 'script.js', `import confetti from 'canvas-confetti';`);

    expect(textOf(result)).toContain('none — write plain HTML, CSS and JavaScript');
  });

  it('refuses a remote font, image or script and says why', async () => {
    const tool = createEmitFileTool('html');

    for (const content of [
      '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">',
      '<img src="https://images.example/hero.png">',
      '<script src="//cdn.example/chart.js"></script>',
    ]) {
      const result = await write(tool, 'index.html', `<body>${content}</body>`);
      expect(textOf(result)).toContain('no network');
    }
    expect(tool.files()).toEqual([]);
  });

  it('does not mistake an SVG namespace for a remote reference', async () => {
    const tool = createEmitFileTool('html');

    await write(
      tool,
      'index.html',
      '<body><svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg></body>',
    );

    expect(tool.files()).toHaveLength(1);
  });
});

describe('judging the collected set', () => {
  it('rejects a run that wrote nothing', () => {
    expect(refuseEmittedSet('html', [])).toContain('not written any files');
  });

  it('rejects a set with no entry point, listing what was written', () => {
    const problem = refuseEmittedSet('react', [{ name: 'Panel.tsx', content: 'export const x = 1' }]);

    expect(problem).toContain('App.tsx');
    expect(problem).toContain('Panel.tsx');
  });

  it('accepts a set with its entry point', () => {
    expect(refuseEmittedSet('html', [{ name: 'index.html', content: '<body>x</body>' }])).toBeNull();
  });
});

describe('telling a URL from something that merely looks like one', () => {
  it('accepts a comment that begins with a double slash', async () => {
    const tool = createEmitFileTool('html');

    await write(tool, 'script.js', '// TODO: tighten the easing curve\nconst a = 1;');

    // Refusing a file over a comment would be worse than missing a URL.
    expect(tool.files()).toHaveLength(1);
  });

  it('still catches a protocol-relative source in an attribute', async () => {
    const tool = createEmitFileTool('html');

    const result = await write(tool, 'index.html', '<body><img src="//cdn.example/x.png"></body>');

    expect(textOf(result)).toContain('no network');
  });
});
