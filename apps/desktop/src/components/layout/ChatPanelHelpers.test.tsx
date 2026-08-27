import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RetryIndicator } from './ChatPanelHelpers';

describe('RetryIndicator', () => {
  it('shows the provider retry attempt and delay', () => {
    const html = renderToStaticMarkup(
      <RetryIndicator
        retry={{
          attempt: 2,
          maxAttempts: 3,
          delayMs: 1250,
          errorMessage: 'Connection failed',
        }}
      />,
    );

    expect(html).toContain('Retrying 2 of 3 in 2s');
    expect(html).toContain('title="Connection failed"');
  });
});
