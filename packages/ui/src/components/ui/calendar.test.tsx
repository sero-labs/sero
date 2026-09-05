import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Calendar } from './calendar';

/**
 * Nothing in this repo renders the calendar, but plugin authors get it
 * from the package. react-day-picker v10 removed class-name slots that
 * v9 accepted, and a removed slot is silently ignored at runtime, so a
 * render is the only thing that catches it.
 */
describe('Calendar', () => {
  it('renders a month grid', () => {
    const html = renderToStaticMarkup(
      <Calendar month={new Date(2026, 0, 1)} />,
    );

    expect(html).toContain('January');
    // Every week of January 2026 plus the outside days.
    expect(html).toContain('>1<');
    expect(html).toContain('>31<');
  });

  it('keeps the styling on the grid slot v10 renamed', () => {
    const html = renderToStaticMarkup(
      <Calendar month={new Date(2026, 0, 1)} />,
    );

    expect(html).toContain('border-collapse');
  });

  it('renders the dropdown caption layout', () => {
    const html = renderToStaticMarkup(
      <Calendar
        month={new Date(2026, 0, 1)}
        captionLayout="dropdown"
        startMonth={new Date(2025, 0)}
        endMonth={new Date(2027, 11)}
      />,
    );

    expect(html).toContain('<select');
  });
});
