import { describe, expect, it, vi } from 'vitest';

import { handleProxyRequestError } from '@electron/features/container/network/http-proxy';

describe('handleProxyRequestError', () => {
  it('writes a 502 response when headers have not been sent yet', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    const destroy = vi.fn();

    handleProxyRequestError({
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      writeHead,
      end,
      destroy,
    });

    expect(writeHead).toHaveBeenCalledWith(502);
    expect(end).toHaveBeenCalledWith('Proxy error');
    expect(destroy).not.toHaveBeenCalled();
  });

  it('destroys the response instead of writing headers twice after streaming starts', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    const destroy = vi.fn();

    handleProxyRequestError({
      headersSent: true,
      writableEnded: false,
      destroyed: false,
      writeHead,
      end,
      destroy,
    });

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(writeHead).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('does nothing for already-ended responses', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    const destroy = vi.fn();

    handleProxyRequestError({
      headersSent: true,
      writableEnded: true,
      destroyed: false,
      writeHead,
      end,
      destroy,
    });

    expect(writeHead).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('does nothing for destroyed responses', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    const destroy = vi.fn();

    handleProxyRequestError({
      headersSent: true,
      writableEnded: false,
      destroyed: true,
      writeHead,
      end,
      destroy,
    });

    expect(writeHead).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
