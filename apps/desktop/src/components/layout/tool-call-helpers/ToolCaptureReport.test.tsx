// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { ToolCaptureReadRequest, ToolCaptureReadResult } from '@/types/tool-capture';
import { ToolCaptureReport } from './ToolCaptureReport';
import { describeToolCapture, type ToolCaptureView } from './tool-capture-details';

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

// The dialog renders in a portal, so its content lives outside `container`.
function dialogButton(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll('button')].find((item) => item.textContent === label);
}

function fileButton(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
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

  it('keeps the tool result to a file control and nothing else', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'full output\n', totalBytes: 12 });
    await render(captureView());

    // No inline output and no explanatory chrome: the card is the control, and
    // the file opens in the dialog without a second click.
    expect(container.textContent).toContain('Full details · 2.0KB');
    expect(container.textContent).not.toContain('The model received');
    expect(container.querySelector('pre')).toBeNull();
    expect(readCapture).not.toHaveBeenCalled();

    await act(async () => fileButton('Full details')?.click());

    // The dialog does not restate what the model received either: the payload
    // above already carries a truncation marker when anything was dropped.
    expect(document.body.textContent).toContain('Tool Details');
    expect(document.body.textContent).not.toContain('The model received');
  });

  it('opens the complete combined output in the Tool Details dialog', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'full output\n', totalBytes: 12 });
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(readCapture).toHaveBeenCalledWith({ path: '/host/combined.log', offset: 0 });
    expect(document.body.textContent).toContain('Tool Details');
    expect(document.querySelector('pre')?.textContent).toBe('full output\n');
  });

  it('opens an individual stream file separately from the combined output', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: '{"ok":true}\n', totalBytes: 12 });
    await render(captureView());

    await act(async () => fileButton('stdout')?.click());

    expect(readCapture).toHaveBeenCalledWith({ path: '/host/stdout.log', offset: 0 });
    expect(document.querySelector('pre')?.textContent).toBe('{"ok":true}\n');
  });

  it('reports that the complete output is unavailable when the file is gone', async () => {
    readCapture.mockResolvedValue({
      state: 'unavailable',
      content: '',
      totalBytes: 0,
      reason: 'The complete output file is no longer available.',
    });
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).toContain('Complete output unavailable: The complete output file is no longer available.');
    // An empty view is not an acceptable answer.
    expect(document.querySelector('pre')).toBeNull();
  });

  it('reports a read failure instead of an empty view', async () => {
    readCapture.mockRejectedValue(new Error('Refusing to read a capture outside the capture root'));
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).toContain('outside the capture root');
    expect(document.querySelector('pre')).toBeNull();
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

  it('opens a dedicated viewer that pages one slice at a time', async () => {
    readCapture.mockImplementation(async (request) => ({
      state: 'ok',
      content: `page-${request.offset ?? 0}`,
      totalBytes: 100,
      ...(request.offset === 0 ? { nextOffset: 10 } : {}),
    }));
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).toContain('page-0');
    expect(readCapture).toHaveBeenLastCalledWith({ path: '/host/combined.log', offset: 0 });

    await act(async () => dialogButton('Next')?.click());

    expect(document.body.textContent).toContain('page-10');
    expect(readCapture).toHaveBeenLastCalledWith({ path: '/host/combined.log', offset: 10 });
  });

  it('reports the shown byte range, not a bare start offset', async () => {
    readCapture.mockImplementation(async (request) => ({
      state: 'ok',
      content: `page-${request.offset ?? 0}`,
      totalBytes: 100,
      ...(request.offset === 0 ? { nextOffset: 10 } : {}),
    }));
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).toContain('Bytes 0–10 of 100');

    await act(async () => dialogButton('Next')?.click());

    // The last slice ends at the file size.
    expect(document.body.textContent).toContain('Bytes 10–100 of 100');
  });

  it('offers no pager for a file that fits in one page', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'all of it', totalBytes: 111 });
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).toContain('Bytes 0–111 of 111');
    // A greyed-out Previous/Next pair reads as a broken control.
    expect(dialogButton('Previous')).toBeUndefined();
    expect(dialogButton('Next')).toBeUndefined();
  });

  it('shows the executed command in the Tool Details dialog', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'all of it', totalBytes: 111 });
    await render(captureView({}, {
      rewrite: { requested: 'pnpm install', executed: 'rtk pnpm install' },
    }));

    await act(async () => fileButton('Full details')?.click());

    // The rewrite lives here, not in the transcript the model reads.
    expect(document.body.textContent).toContain('Requested');
    expect(document.body.textContent).toContain('pnpm install');
    expect(document.body.textContent).toContain('Executed');
    expect(document.body.textContent).toContain('rtk pnpm install');
  });

  it('omits the rewrite rows when the command ran as written', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'all of it', totalBytes: 111 });
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).not.toContain('Executed');
  });

  it('opens a large reading surface instead of the default dialog width', async () => {
    readCapture.mockResolvedValue({ state: 'ok', content: 'all of it', totalBytes: 111 });
    await render(captureView());

    await act(async () => fileButton('Full details')?.click());

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

    await act(async () => fileButton('Full details')?.click());

    expect(document.body.textContent).toContain('Empty file');
  });
});
