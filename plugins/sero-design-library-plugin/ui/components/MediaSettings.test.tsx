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
  run.mockResolvedValue({ content: [], details: { status: 'missing' } });
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
  it('commits an endpoint id when the field is done, not on every keystroke', async () => {
    render(<MediaSettings media={MEDIA} />);

    const field = screen.getByLabelText('Video');
    await userEvent.type(field, 'veo/fast');
    // A model id is meaningless half-written; a per-keystroke write would queue
    // eight settings updates for values that were never a real endpoint.
    expect(callsFor('set-media-model')).toHaveLength(0);

    await userEvent.tab();
    expect(callsFor('set-media-model')[0]?.[1]).toMatchObject({
      capability: 'text-to-video',
      mediaModel: 'veo/fast',
    });
  });

  it('writes nothing when the value comes back unchanged', async () => {
    render(<MediaSettings media={MEDIA} />);

    await userEvent.click(screen.getByLabelText('Image'));
    await userEvent.tab();

    expect(callsFor('set-media-model')).toHaveLength(0);
  });

  it('shows each capability separately', () => {
    render(<MediaSettings media={MEDIA} />);

    for (const label of ['Image', 'Reference image', 'Remix', 'Upscale', 'Video', 'Animate']) {
      expect(screen.getByLabelText(label), label).toBeDefined();
    }
  });
});

describe('the per-run cap', () => {
  it('refuses a value outside the range instead of storing it', async () => {
    render(<MediaSettings media={MEDIA} />);
    const field = screen.getByLabelText('Media calls per run');

    await userEvent.clear(field);
    await userEvent.type(field, '99');

    // 9 is in range and is written; 99 is not and is not.
    const written = callsFor('set-media-cap').map(([, params]) => params?.callsPerRun);
    expect(written).not.toContain(99);
  });
});
