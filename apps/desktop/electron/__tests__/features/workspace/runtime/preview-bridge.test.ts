import { describe, expect, it } from 'vitest';
import {
  previewBridgeMarker,
  startPreviewBridgeCommand,
  stopPreviewBridgeCommand,
} from '@electron/features/workspace/runtime/backends/preview-bridge';

describe('runtime preview bridge commands', () => {
  it('does not let stale-bridge cleanup kill the current exec shell', () => {
    const marker = previewBridgeMarker('workspace-a', 5173, 32000);
    const stopCommand = stopPreviewBridgeCommand('workspace-a', 5173, 32000);
    const startCommand = startPreviewBridgeCommand('workspace-a', 5173, 32000);

    expect(stopCommand).toContain(`pgrep -f '${marker}'`);
    expect(stopCommand).toContain('[ "$pid" = "$$" ] || kill "$pid"');
    expect(stopCommand).not.toContain('pkill -f');
    expect(startCommand).toContain(stopCommand);
  });

  it.each([
    ['non-integer', 5173.5],
    ['zero', 0],
    ['negative', -1],
    ['above 65535', 70000],
    ['NaN', Number.NaN],
  ])('rejects %s targetPort values to avoid JS-injection into the bridge script', (_label, port) => {
    expect(() => startPreviewBridgeCommand('workspace-a', port as number, 32000))
      .toThrow(/targetPort/);
    expect(() => stopPreviewBridgeCommand('workspace-a', port as number, 32000))
      .toThrow(/targetPort/);
  });

  it('rejects non-integer internalPort values', () => {
    expect(() => startPreviewBridgeCommand('workspace-a', 5173, 32000.1))
      .toThrow(/internalPort/);
  });
});
