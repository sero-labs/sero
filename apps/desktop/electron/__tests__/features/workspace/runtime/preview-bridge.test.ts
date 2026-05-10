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
});
