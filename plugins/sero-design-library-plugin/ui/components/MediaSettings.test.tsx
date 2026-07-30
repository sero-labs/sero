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

function renderSettings() {
  return render(<MediaSettings media={MEDIA} />);
}

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
                {
                  id: 'fal-ai/flux/dev',
                  label: 'FLUX Dev · fal-ai/flux/dev',
                  provider: 'fal-ai',
                },
                {
                  id: 'openai/image',
                  label: 'OpenAI Image · openai/image',
                  provider: 'openai',
                },
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
    renderSettings();

    await waitFor(() =>
      expect(screen.getByText('Using FAL_KEY from the environment')).toBeDefined(),
    );
    // The status came from a tool call, not from reactive state.
    expect(callsFor('key-status')).toHaveLength(1);
  });

  it('saves a key and re-reads the status rather than assuming it', async () => {
    renderSettings();
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
    renderSettings();
    await waitFor(() => expect(callsFor('key-status')).toHaveLength(1));

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('offers Remove only when there is a saved key to remove', async () => {
    renderSettings();
    await waitFor(() => expect(screen.getByText(/No key/)).toBeDefined());
    // Nothing stored: removing would be a button that does nothing.
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('media models', () => {
  it('searches grouped provider choices and saves the selected opaque model id', async () => {
    renderSettings();

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    await userEvent.click(screen.getByLabelText('Image'));
    expect(screen.getByText('fal-ai')).toBeDefined();
    expect(screen.getByText('openai')).toBeDefined();
    await userEvent.clear(screen.getByLabelText('Image'));
    await userEvent.type(screen.getByLabelText('Image'), 'OpenAI');
    await userEvent.click(screen.getByRole('option', { name: /OpenAI Image/ }));

    expect(callsFor('set-media-model')[0]?.[1]).toMatchObject({
      capability: 'text-to-image',
      mediaModel: 'openai/image',
    });
  });

  it('keeps a saved model that the provider no longer lists', async () => {
    renderSettings();

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    await userEvent.click(screen.getByLabelText('Image'));
    expect(screen.getByText('Saved choice')).toBeDefined();
    expect(screen.getByRole('option', { name: 'flux/dev' })).toBeDefined();
  });

  it('keeps manual entry available and retries after a catalogue error', async () => {
    run.mockImplementation(async (_tool: string, params: Record<string, unknown>) => {
      if (params.action === 'list-media-models') {
        throw new Error('The media provider model catalogue returned 429.');
      }
      return { content: [], details: { status: 'missing' } };
    });
    renderSettings();

    expect((await screen.findByRole('alert')).textContent).toContain('returned 429');
    const input = screen.getByLabelText('Image');
    await userEvent.clear(input);
    await userEvent.type(input, 'private/image-model');
    await userEvent.click(screen.getByRole('option', { name: 'private/image-model' }));

    expect(callsFor('set-media-model')[0]?.[1]).toMatchObject({
      capability: 'text-to-image',
      mediaModel: 'private/image-model',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(2));
    expect(callsFor('list-media-models')[1]?.[1]).toMatchObject({ refresh: true });
  });

  it('does not hide later provider groups in a long catalogue', async () => {
    run.mockImplementation(async (_tool: string, params: Record<string, unknown>) => ({
      content: [],
      details:
        params.action === 'list-media-models'
          ? {
              models: {
                ...MEDIA.models,
                'text-to-image': [
                  ...Array.from({ length: 55 }, (_, index) => ({
                    id: `fal-ai/model-${index}`,
                    label: `FAL model ${index}`,
                    provider: 'fal-ai',
                  })),
                  { id: 'openai/image', label: 'OpenAI Image', provider: 'openai' },
                ],
              },
            }
          : { status: 'missing' },
    }));
    renderSettings();

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    await userEvent.click(screen.getByLabelText('Image'));
    expect(screen.getByText('openai')).toBeDefined();
  });

  it('shows each capability separately', async () => {
    renderSettings();

    await waitFor(() => expect(callsFor('list-media-models')).toHaveLength(1));
    for (const label of ['Image', 'Reference image', 'Remix', 'Upscale', 'Video', 'Animate']) {
      expect(screen.getByLabelText(label), label).toBeDefined();
      expect(screen.getByRole('button', { name: `How ${label} is used` }), label).toBeDefined();
    }
  });

  it('explains where each model is used', async () => {
    renderSettings();

    await userEvent.hover(screen.getByRole('button', { name: 'How Animate is used' }));
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      'Used when a Design animates an existing image.',
    );
  });
});

describe('the per-run cap', () => {
  it('uses the bounded stepper to update the cap', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'One more media call' }));

    const written = callsFor('set-media-cap').map(([, params]) => params?.callsPerRun);
    expect(written).toEqual([7]);
  });
});
