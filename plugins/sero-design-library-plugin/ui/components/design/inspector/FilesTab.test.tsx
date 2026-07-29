// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilesTab } from './FilesTab';

/**
 * The first component test in this plugin, and so also the one that proves the
 * harness: jsdom per file, `@sero-ai/ui` rendering, cleanup between tests.
 *
 * What it asserts about `FilesTab` is the tab's actual reason to exist — a
 * revision that was written without a stylesheet is visible here and nowhere
 * else, which only works if the list is what the revision says it is rather
 * than what the panel expects it to be.
 */
describe('FilesTab', () => {
  it('lists exactly the files the revision holds, with their sizes', () => {
    render(
      <FilesTab
        files={[
          { name: 'index.html', bytes: 2048 },
          { name: 'styles.css', bytes: 512 },
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('index.html')).toBeDefined();
    expect(screen.getByText('2.0 KB')).toBeDefined();
  });

  it('says nothing has been written rather than showing an empty list', () => {
    render(<FilesTab files={[]} />);

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Nothing has been written yet.')).toBeDefined();
  });

  it('opens the revision folder when the desktop action is available', async () => {
    const onOpen = vi.fn();
    render(<FilesTab files={[{ name: 'index.html', bytes: 20 }]} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open in Finder' }));

    expect(onOpen).toHaveBeenCalledOnce();
  });
});
