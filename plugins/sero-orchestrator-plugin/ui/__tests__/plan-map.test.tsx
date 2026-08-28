import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { previewLoop } from '../__preview__/fixture';
import { PlanMap } from '../components/PlanMap';

describe('PlanMap', () => {
  it.each([1, 2, 3, 4] as const)(
    'does not enable horizontal scrolling with %i step(s) per row',
    (stepsPerRow) => {
      const markup = renderToStaticMarkup(<PlanMap loop={previewLoop} stepsPerRow={stepsPerRow} />);

      expect(markup).toContain('overflow-x-hidden');
      expect(markup).not.toContain('overflow-x-auto');
    },
  );
});
