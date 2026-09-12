// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { ToolCaptureReadRequest, ToolCaptureReadResult } from '@/types/tool-capture';
import { ToolCaptureReport } from './ToolCaptureReport';
import { describeToolCapture, type ToolCaptureView } from './tool-capture-details';

/** Must match the inline preview cap in ToolCaptureReport. */
const INLINE_PREVIEW_CAP = 64 * 1024;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readCapture = vi.fn<(request: ToolCaptureReadRequest) => Promise<ToolCaptureReadResult>>();

function captureView(
  overrides: Record<string, unknown> = {},
  topLevel: Record<string, unknown> = {},
): ToolCaptureView {
  const view = describeToolCapture({
    exitCode: 0,
    ...topLevel,
    capture: {
      version: 1,
      captureId: 'capture-1',
      producerSessionId: 'session-a',
      complete: true,
      combined: { stream: 'combined', runtimePath: '/rt/combined.log', hostPath: '/host/combined.log', bytes: 2048 },
      stdout: { stream: 'stdout', runtimePath: '/rt/stdout.log', hostPath: '/host/stdout.log', bytes: 1024 },
      ...overrides,
    },
  });
  if (!view) throw new Error('capture view was not parsed');
  return view;
}

describe('ToolCaptureReport', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    readCapture.mockReset();
    (window as unknown as { sero?: unknown }).sero = { toolCapture: { readCapture } };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (window as unknown as { sero?: unknown }).sero;
  });

  async function render(view: ToolCaptureView): Promise<void> {
    await act(async () => root.render(<ToolCaptureReport view={view} />));
  }

  it('says the model received all of the output when nothing was truncated', async () => {
    await render(captureView());

    expect(container.textContent).toContain('The model received all of the output.');
    expect(container.textContent).not.toContain('bounded preview');
  });

  it('marks a truncated result as a bounded preview without claiming every result was truncated', async () => {
    await render(captureView({}, { truncation: { truncated: true } }));

    expect(container.textContent).toContain('The model received a bounded preview.');
  });

  it('opens the complete combined output for the user', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'full output\n', totalBytes: 12 });
    await render(captureView());

    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    expect(button?.textContent).toContain('Combined output · 2.0KB');

    await act(async () => button?.click());

    expect(readCapture).toHaveBeenCalledWith({ path: '/host/combined.log', offset: undefined });
    expect(container.querySelector('pre')?.textContent).toBe('full output\n');
  });

  it('opens an individual stream file separately from the combined output', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: '{"ok":true}\n', totalBytes: 12 });
    await render(captureView());

    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith('stdout'));
    await act(async () => button?.click());

    expect(readCapture).toHaveBeenCalledWith({ path: '/host/stdout.log', offset: undefined });
    expect(container.querySelector('pre')?.textContent).toBe('{"ok":true}\n');
  });

  it('reports that the complete output is unavailable when the file is gone', async () => {
    readCapture.mockResolvedValue({
      state: 'unavailable',
      content: '',
      totalBytes: 0,
      reason: 'The complete output file is no longer available.',
    });
    await render(captureView());

    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => button?.click());

    expect(container.textContent).toContain('Complete output unavailable: The complete output file is no longer available.');
    // An empty view is not an acceptable answer.
    expect(container.querySelector('pre')).toBeNull();
  });

  it('reports a read failure instead of an empty view', async () => {
    readCapture.mockRejectedValue(new Error('Refusing to read a capture outside the capture root'));
    await render(captureView());

    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => button?.click());

    expect(container.textContent).toContain('outside the capture root');
    expect(container.querySelector('pre')).toBeNull();
  });

  it('pages through a large capture and hides Load more at the end', async () => {
    readCapture
      .mockResolvedValueOnce({ state: 'ok', content: 'first', totalBytes: 10, nextOffset: 5 })
      .mockResolvedValueOnce({ state: 'ok', content: 'second', totalBytes: 10 });
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());
    expect(container.querySelector('pre')?.textContent).toBe('first');

    const more = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Load more');
    expect(more).toBeDefined();
    await act(async () => more?.click());

    expect(readCapture).toHaveBeenLastCalledWith({ path: '/host/combined.log', offset: 5 });
    expect(container.querySelector('pre')?.textContent).toBe('firstsecond');
    expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Load more')).toBe(false);
  });

  it('reports an incomplete capture and offers no files', async () => {
    const view = describeToolCapture({
      capture: {
        version: 1,
        captureId: 'capture-3',
        producerSessionId: 'session-a',
        complete: false,
        unavailableReason: 'capture root is not writable.',
      },
    });
    await render(view as ToolCaptureView);

    expect(container.textContent).toContain('Complete output unavailable: capture root is not writable.');
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(readCapture).not.toHaveBeenCalled();
  });

  it('caps the inline preview and points at the full viewer', async () => {
    const slice = 'x'.repeat(40_000);
    readCapture.mockImplementation(async (request) => ({
      state: 'ok',
      content: slice,
      totalBytes: 120_000,
      ...(request.offset === undefined ? { nextOffset: 40_000 } : {}),
    }));
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());

    const more = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Load more');
    await act(async () => more?.click());

    expect((container.querySelector('pre')?.textContent ?? '').length).toBeLessThanOrEqual(INLINE_PREVIEW_CAP);
    expect(container.textContent).toContain('Preview capped at');
    expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Load more')).toBe(false);
    expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Open full output')).toBe(true);
  });

  it('opens a dedicated viewer that pages one slice at a time', async () => {
    readCapture.mockImplementation(async (request) => ({
      state: 'ok',
      content: `page-${request.offset ?? 0}`,
      totalBytes: 100,
      ...(request.offset === 0 || request.offset === undefined ? { nextOffset: 10 } : {}),
    }));
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());

    const full = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Open full output');
    await act(async () => full?.click());

    expect(document.body.textContent).toContain('page-0');
    expect(readCapture).toHaveBeenLastCalledWith({ path: '/host/combined.log', offset: 0 });

    const next = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Next');
    await act(async () => next?.click());

    expect(document.body.textContent).toContain('page-10');
    expect(readCapture).toHaveBeenLastCalledWith({ path: '/host/combined.log', offset: 10 });
  });

  it('reports the shown byte range, not a bare start offset', async () => {
    readCapture.mockImplementation(async (request) => ({
      state: 'ok',
      content: `page-${request.offset ?? 0}`,
      totalBytes: 100,
      ...(request.offset === 0 || request.offset === undefined ? { nextOffset: 10 } : {}),
    }));
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());
    const full = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Open full output');
    await act(async () => full?.click());

    expect(document.body.textContent).toContain('Bytes 0–10 of 100');

    const next = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Next');
    await act(async () => next?.click());

    // The last slice ends at the file size.
    expect(document.body.textContent).toContain('Bytes 10–100 of 100');
  });

  it('offers no pager for a file that fits in one page', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'all of it', totalBytes: 111 });
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());
    const full = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Open full output');
    await act(async () => full?.click());

    expect(document.body.textContent).toContain('Bytes 0–111 of 111');
    // A greyed-out Previous/Next pair reads as a broken control.
    expect([...document.querySelectorAll('button')].some((item) => item.textContent === 'Previous')).toBe(false);
    expect([...document.querySelectorAll('button')].some((item) => item.textContent === 'Next')).toBe(false);
  });

  it('opens a large reading surface instead of the default dialog width', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'all of it', totalBytes: 111 });
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());
    const full = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Open full output');
    await act(async () => full?.click());

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog).not.toBeNull();
    // The dialog primitive caps itself at `sm:max-w-lg`. A log viewer must lift
    // that cap and claim most of the viewport, or large captures are unreadable.
    expect(dialog?.className).toContain('sm:max-w-none');
    // The merge must drop the primitive's 512px cap, not keep both rules.
    expect(dialog?.className).not.toContain('sm:max-w-lg');
    expect(dialog?.className).toContain('h-[min(88vh,60rem)]');
    expect(dialog?.className).toContain('w-[min(94vw,80rem)]');
    // The content scrolls inside the dialog, so the header and footer stay put.
    expect(dialog?.querySelector('pre')?.className).toContain('flex-1');
    expect(dialog?.querySelector('pre')?.className).toContain('overflow-auto');
  });

  it('labels an empty capture instead of claiming a zero-byte range', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: '', totalBytes: 0 });
    await render(captureView());

    const open = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Combined output'));
    await act(async () => open?.click());
    const full = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Open full output');
    await act(async () => full?.click());

    expect(document.body.textContent).toContain('Empty file');
  });
});
