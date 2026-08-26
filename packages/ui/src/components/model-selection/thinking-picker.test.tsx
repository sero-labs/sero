import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ThinkingPicker } from './thinking-picker';

describe('ThinkingPicker', () => {
  it('hides unsupported thinking levels', () => {
    const html = renderToStaticMarkup(
      <ThinkingPicker
        available={['off', 'low', 'high']}
        current="low"
        disabled={false}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('Off');
    expect(html).toContain('Low');
    expect(html).toContain('High');
    expect(html).not.toContain('X-High');
    expect(html).not.toContain('Max');
  });

  it('shows only Off when the model has no thinking support', () => {
    const html = renderToStaticMarkup(
      <ThinkingPicker
        available={[]}
        current="off"
        disabled
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('Off');
    expect(html).not.toContain('Min');
    expect(html).not.toContain('Low');
    expect(html).not.toContain('Med');
    expect(html).not.toContain('High');
    expect(html).not.toContain('X-High');
    expect(html).not.toContain('Max');
  });
});
