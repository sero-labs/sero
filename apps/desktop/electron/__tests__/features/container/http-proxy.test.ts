import { describe, expect, it, vi } from 'vitest';

import {
  handleProxyRequestError,
  isAllowedProxyClient,
  isBlockedProxyTarget,
} from '@electron/features/container/network/http-proxy';

describe('isAllowedProxyClient', () => {
  it('allows only the container subnet, including IPv4-mapped addresses', () => {
    expect(isAllowedProxyClient('192.168.64.23')).toBe(true);
    expect(isAllowedProxyClient('::ffff:192.168.64.23')).toBe(true);
    expect(isAllowedProxyClient('127.0.0.1')).toBe(false);
    expect(isAllowedProxyClient('192.168.65.23')).toBe(false);
  });
});

describe('isBlockedProxyTarget', () => {
  it('blocks loopback and private-network targets while allowing public destinations', () => {
    expect(isBlockedProxyTarget('localhost')).toBe(true);
    expect(isBlockedProxyTarget('127.0.0.1')).toBe(true);
    expect(isBlockedProxyTarget('192.168.64.12')).toBe(true);
    expect(isBlockedProxyTarget('fc00::1')).toBe(true);
    expect(isBlockedProxyTarget('example.com')).toBe(false);
    expect(isBlockedProxyTarget('1.1.1.1')).toBe(false);
  });
});

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
