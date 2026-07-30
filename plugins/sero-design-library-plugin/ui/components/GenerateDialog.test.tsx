// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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
      sources={[{ id: 'item-1', label: 'A warm gradient', kind: 'image' }]}
      onOpenChange={() => {}}
      onGenerate={onGenerate}
      {...overrides}
    />,
  );
  return { onGenerate };
}

async function chooseOperation(label: string) {
  await userEvent.click(screen.getByRole('tab', { name: label }));
}

describe('fresh generation', () => {
  it('shows only source-free operations and gives the prompt more space', () => {
    renderDialog();

    expect(screen.getByRole('heading', { name: 'Generate' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'New image' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'New video' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Restyle' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Upscale' })).toBeNull();
    expect(screen.getByLabelText('Describe it').getAttribute('rows')).toBe('6');
  });
});

describe('a video model that only makes long clips', () => {
  const longOnly = { 'text-to-video': { durationsSeconds: [20, 40] } };

  it('says why, and will not let the generation be started', async () => {
    const { onGenerate } = renderDialog({ modelOptions: longOnly });
    await chooseOperation('New video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'a slow pan');

    expect(screen.getByText(/shorter/)).toBeDefined();
    const generate = screen.getByRole('button', { name: /Generate/ });
    expect(generate.hasAttribute('disabled')).toBe(true);

    await userEvent.click(generate);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('lets a model through as soon as one length fits', async () => {
    renderDialog({ modelOptions: { 'text-to-video': { durationsSeconds: [5, 20] } } });
    await chooseOperation('New video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'a slow pan');

    expect(screen.queryByText(/shorter/)).toBeNull();
    expect(screen.getByRole('button', { name: /Generate/ }).hasAttribute('disabled')).toBe(false);
  });
});

describe('remixing a reference', () => {
  it('offers grouped source operations and sends the source to image-to-video', async () => {
    const { onGenerate } = renderDialog({ initialSourceId: 'item-1' });
    expect(screen.getByLabelText('Work from')).toBeDefined();
    expect(screen.getByText('Create new')).toBeDefined();
    expect(screen.getByText('Edit this reference')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Restyle' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Upscale' })).toBeDefined();

    await chooseOperation('New video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'animate this');
    await userEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'image-to-video',
        prompt: 'animate this',
        sourceId: 'item-1',
      }),
    );
  });

  it('restyles the current reference', async () => {
    const { onGenerate } = renderDialog({ initialSourceId: 'item-1' });
    await chooseOperation('Restyle');
    await userEvent.type(screen.getByLabelText('Describe it'), 'use a paper collage style');
    await userEvent.click(screen.getByRole('button', { name: 'Restyle' }));

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'image-to-image',
        prompt: 'use a paper collage style',
        sourceId: 'item-1',
      }),
    );
  });

  it('hides aspect ratio when the image-to-video endpoint does not accept it', async () => {
    const { onGenerate } = renderDialog({
      initialSourceId: 'item-1',
      modelOptions: { 'image-to-video': { supportsAspectRatio: false } },
    });
    await chooseOperation('New video');
    await userEvent.type(screen.getByLabelText('Describe it'), 'animate this');

    expect(screen.queryByLabelText('Aspect')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.not.objectContaining({ aspectRatio: expect.anything() }),
    );
  });

  it('finds a different source in a large Library by typing', async () => {
    const sources = Array.from({ length: 1_000 }, (_, index) => ({
      id: `item-${index}`,
      label: `Reference ${index}`,
      kind: 'image' as const,
    }));
    const { onGenerate } = renderDialog({
      sources,
      initialSourceId: 'item-0',
    });

    const source = screen.getByLabelText('Work from');
    source.focus();
    fireEvent.change(source, { target: { value: 'Reference 999' } });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await userEvent.type(screen.getByLabelText('Describe it'), 'a colder composition');
    await userEvent.click(screen.getByRole('button', { name: 'Generate image' }));

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'item-999' }),
    );
  });

  it('does not offer a video as an image source', () => {
    renderDialog({
      sources: [{ id: 'video-1', label: 'A short clip', kind: 'video' }],
      initialSourceId: 'video-1',
    });

    expect(screen.getByText('Nothing in the Library to work from yet.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Generate image' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('clears the selected source when the combobox is cleared', async () => {
    const { onGenerate } = renderDialog({ initialSourceId: 'item-1' });
    const source = screen.getByLabelText('Work from');
    await userEvent.clear(source);
    await userEvent.type(screen.getByLabelText('Describe it'), 'a colder composition');

    expect(screen.getByRole('button', { name: 'Generate image' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
