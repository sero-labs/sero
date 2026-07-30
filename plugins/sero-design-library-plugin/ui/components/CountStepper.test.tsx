// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CountStepper } from './CountStepper';

describe('CountStepper', () => {
  it('changes by one and stops at its bounds', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CountStepper
        value={2}
        min={1}
        max={3}
        label="Items"
        decrementLabel="One fewer item"
        incrementLabel="One more item"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'One fewer item' }));
    await userEvent.click(screen.getByRole('button', { name: 'One more item' }));
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([1, 3]);

    rerender(
      <CountStepper
        value={1}
        min={1}
        max={3}
        label="Items"
        decrementLabel="One fewer item"
        incrementLabel="One more item"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'One fewer item' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
