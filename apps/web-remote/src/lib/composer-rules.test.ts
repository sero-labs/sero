import { describe, expect, it } from 'vitest';
import { canSend } from './composer-rules';

const ready = { disabled: false, isStreaming: false };

describe('canSend', () => {
  it('sends an image with no text', () => {
    expect(canSend({ ...ready, text: '', attachmentCount: 1 })).toBe(true);
  });

  it('sends text with no image', () => {
    expect(canSend({ ...ready, text: 'hi', attachmentCount: 0 })).toBe(true);
  });

  it('sends nothing when there is neither', () => {
    expect(canSend({ ...ready, text: '   ', attachmentCount: 0 })).toBe(false);
  });

  it('waits while a turn streams or the composer is off', () => {
    expect(canSend({ text: 'hi', attachmentCount: 1, disabled: true, isStreaming: false })).toBe(false);
    expect(canSend({ text: 'hi', attachmentCount: 1, disabled: false, isStreaming: true })).toBe(false);
  });
});
