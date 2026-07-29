// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GenerateDialog, type GenerateDialogProps } from './GenerateDialog';

/**
 * The dialog, at the two points where it can cost the user something.
 *
 * Both cases here were found in a manual pass: a video model whose shortest
 * clip is longer than this app will buy, and a reference chosen for a restyle
 * that quietly stopped applying when the capability changed. Neither showed up
 * as an error — the first spent money on the wrong thing, the second produced
 * artwork from the prompt alone while the dialog still looked like it was
 * working from the picture.
 */

function renderDialog(overrides: Partial<GenerateDialogProps> = {}) {
  const onGenerate = vi.fn();
  render(
    <GenerateDialog
      open
      target={{ kind: 'library' }}
      sources={[{ id: 'item-1', label: 'A warm gradient' }]}
      onOpenChange={() => {}}
      onGenerate={onGenerate}
      {...overrides}
    />,
  );
  return { onGenerate };
}

async function chooseCapability(label: string) {
  await userEvent.click(screen.getByRole('radio', { name: label }));
}

describe('a video model that only makes long clips', () => {
  const longOnly = { 'text-to-video': { durationsSeconds: [20, 40] } };

  it('says why, and will not let the generation be started', async () => {
    const { onGenerate } = renderDialog({ modelOptions: longOnly });
    await chooseCapability('Video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'a slow pan');

    expect(screen.getByText(/shorter/)).toBeDefined();
    const generate = screen.getByRole('button', { name: /Generate/ });
    expect(generate.hasAttribute('disabled')).toBe(true);

    await userEvent.click(generate);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('lets a model through as soon as one length fits', async () => {
    renderDialog({ modelOptions: { 'text-to-video': { durationsSeconds: [5, 20] } } });
    await chooseCapability('Video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'a slow pan');

    expect(screen.queryByText(/shorter/)).toBeNull();
    expect(screen.getByRole('button', { name: /Generate/ }).hasAttribute('disabled')).toBe(false);
  });
});

describe('a reference the capability cannot use', () => {
  it('says so rather than dropping it in silence', async () => {
    const { onGenerate } = renderDialog({ initialSourceId: 'item-1' });
    // Restyle opens working from the chosen picture; Video cannot use one.
    expect(screen.getByLabelText('Work from')).toBeDefined();

    await chooseCapability('Video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'animate this');

    expect(screen.getByText(/will not be used/)).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /Generate/ }));
    // And what goes out matches what was said: no source on the request.
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'text-to-video', prompt: 'animate this' }),
    );
    expect(onGenerate.mock.calls[0]?.[0].sourceId).toBeUndefined();
  });
});
