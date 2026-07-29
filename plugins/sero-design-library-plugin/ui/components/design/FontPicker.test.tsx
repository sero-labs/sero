// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DESIGN_FONT_OPTIONS } from '../../../shared/fonts';
import { FontPicker } from './FontPicker';

describe('Design FontPicker', () => {
  it('shows the real font catalog and selects a web font', async () => {
    const onChange = vi.fn();
    render(
      <FontPicker
        id="font"
        label="Font"
        value="system-ui, sans-serif"
        options={DESIGN_FONT_OPTIONS.map(({ label, value }) => ({ label, value }))}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Font' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Inter' }));

    expect(onChange).toHaveBeenCalledWith('Inter, system-ui, sans-serif');
  });
});
