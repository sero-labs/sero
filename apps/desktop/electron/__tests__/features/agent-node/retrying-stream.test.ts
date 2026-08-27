import { describe, expect, it, vi } from 'vitest';
import { ControlNotFoundError } from '@electron/features/agent-node/control-client';
import { RetryingStream } from '@electron/features/agent-node/retrying-stream';

describe('Agent Node retrying stream', () => {
  it('returns not-found errors without retrying', async () => {
    const open = vi.fn().mockRejectedValue(new ControlNotFoundError());
    const stream = new RetryingStream(open, vi.fn());

    await expect(stream.start()).rejects.toBeInstanceOf(ControlNotFoundError);
    expect(open).toHaveBeenCalledOnce();
  });
});
