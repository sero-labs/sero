import { describe, expect, it } from 'vitest';

import { generationProgressMessage } from './run';

describe('generation progress copy', () => {
  it('turns internal tool activity into plain English', () => {
    expect(generationProgressMessage('  📂 design_library_write_file: index.html')).toBe(
      'Writing the design files…',
    );
    expect(generationProgressMessage('  📂 design_library_declare_tweaks: controls')).toBe(
      'Adding design controls…',
    );
    expect(generationProgressMessage('  📂 design_library_generate_image: hero')).toBe(
      'Creating artwork…',
    );
  });

  it('does not expose an unknown host update', () => {
    expect(generationProgressMessage('provider debug output')).toBeNull();
  });
});
