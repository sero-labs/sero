// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DesignLoadingState } from './DesignLoadingState';

describe('Design loading state', () => {
  it('announces the latest generation activity in the design area', () => {
    render(<DesignLoadingState message="Writing the design files…" />);

    expect(screen.getByRole('status').textContent).toContain('Writing the design files…');
  });
});
