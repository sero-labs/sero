// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaSettings as MediaSettingsValue } from '../../shared/settings';

/**
 * Media settings, and the key in particular.
 *
 * The key is the one value in this plugin that must never reach reactive state,
 * so the panel learns its status by asking and is told `env | stored | missing`
 * — never the key. These tests watch the tool calls the panel makes, because
 * that is where the rule is either kept or broken.
 */

const run = vi.fn();
vi.mock('@sero-ai/app-runtime', () => ({ useAppTools: () => ({ run }) }));

// eslint-disable-next-line import/first -- must follow the mock above
import { MediaSettings } from './MediaSettings';

const MEDIA: MediaSettingsValue = {
  models: {
    'text-to-image': 'flux/dev',
    'reference-to-image': '',
    'image-to-image': '',
    upscale: '',
    'text-to-video': '',
    'image-to-video': '',
  },
  callsPerRun: 6,
};

function callsFor(action: string) {
  return run.mock.calls.filter(([, params]) => params?.action === action);
}

beforeEach(() => {
  run.mockReset();
  run.mockImplementation(async (_tool: string, params: Record<string, unknown>) => ({
    content: [],
    details:
      params.action === 'list-media-models'
        ? {
            models: {
              'text-to-image': [
                { id: 'fal-ai/flux/dev', label: 'FLUX Dev · fal-ai/flux/dev' },
                { id: 'fal-ai/flux/schnell', label: 'FLUX Schnell · fal-ai/flux/schnell' },
              ],
              'reference-to-image': [],
              'image-to-image': [],
              upscale: [],
              'text-to-video': [],
              'image-to-video': [],
            },
          }
        : { status: 'missing' },
  }));
});

describe('the provider key', () => {
  it('asks where the key came from and says so', async () => {
    run.mockResolvedValue({ content: [], details: { status: 'env' } });
    render(<MediaSettings media={MEDIA} />);

    await waitFor(() =>
      expect(screen.getByText('Using FAL_KEY from the environment')).toBeDefined(),
    );
    // The status came from a tool call, not from reactive state.
    expect(callsFor('key-status')).toHaveLength(1);
  });

  it('saves a key and re-reads the status rather than assuming it', async () => {
    render(<MediaSettings media={MEDIA} />);
    await waitFor(() => expect(callsFor('key-status')).toHaveLength(1));

    await userEvent.type(screen.getByLabelText('Provider key'), 'secret-key');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(callsFor('store-key')[0]?.[1]).toMatchObject({ key: 'secret-key' });
    // Read back, because FAL_KEY in the environment still wins: saying "stored"
    // when the environment is what will be used points at the wrong key when
    // the next call fails.
    await waitFor(() => expect(callsFor('key-status')).toHaveLength(2));
  });

  it('will not submit an empty key', async () => {
    render(<MediaSettings media={MEDIA} />);
    await waitFor(() => expect(callsFor('key-status')).toHaveLength(1));

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('offers Remove only when there is a saved key to remove', async () => {
    render(<MediaSettings media={MEDIA} />);
    await waitFor(() => expect(screen.getByText(/No key/)).toBeDefined());
    // Nothing stored: removing would be a button that does nothing.
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('media models', () => {
  it('loads provider choices and saves the selected opaque model id', async () => {
    render(<MediaSettings media={MEDIA} />);

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    await userEvent.click(screen.getByLabelText('Image'));
    await userEvent.click(screen.getByRole('option', { name: /FLUX Schnell/ }));

    expect(callsFor('set-media-model')[0]?.[1]).toMatchObject({
      capability: 'text-to-image',
      mediaModel: 'fal-ai/flux/schnell',
    });
  });

  it('keeps a saved model that the provider no longer lists', async () => {
    render(<MediaSettings media={MEDIA} />);

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    await userEvent.click(screen.getByLabelText('Image'));
    expect(screen.getByRole('option', { name: 'flux/dev' })).toBeDefined();
  });

  it('shows each capability separately', async () => {
    render(<MediaSettings media={MEDIA} />);

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    for (const label of ['Image', 'Reference image', 'Remix', 'Upscale', 'Video', 'Animate']) {
      expect(screen.getByLabelText(label), label).toBeDefined();
    }
  });
});

describe('the per-run cap', () => {
  it('uses the bounded stepper to update the cap', async () => {
    render(<MediaSettings media={MEDIA} />);
    await userEvent.click(screen.getByRole('button', { name: 'One more media call' }));

    const written = callsFor('set-media-cap').map(([, params]) => params?.callsPerRun);
    expect(written).toEqual([7]);
  });
});
