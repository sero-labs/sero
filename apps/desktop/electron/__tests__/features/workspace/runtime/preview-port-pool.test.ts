import { describe, expect, it } from 'vitest';
import { allocatePreviewSlot, buildPreviewInternalPorts, createPreviewSlots, parseApplePreviewPortMappings, parseDockerPreviewPortMappings } from '@electron/features/workspace/runtime/backends/preview-port-pool';

describe('preview port pool', () => {
  it('allocates internal gateway ports and reports exhaustion with pool size', () => {
    const slots = createPreviewSlots([{ internalPort: 32000, hostPort: 51000 }]);
    expect(allocatePreviewSlot(slots, 5173)).toMatchObject({ internalPort: 32000, hostPort: 51000 });
    expect(() => allocatePreviewSlot(slots, 3000)).toThrow('Pool size is 1');
  });

  it('parses Docker inspect host port bindings', () => {
    const inspect = { NetworkSettings: { Ports: { '32000/tcp': [{ HostIp: '127.0.0.1', HostPort: '49153' }] } } };
    expect(parseDockerPreviewPortMappings(inspect, [32000])).toEqual([{ internalPort: 32000, hostPort: 49153 }]);
  });

  it('parses Apple Container published loopback ports', () => {
    const inspect = { configuration: { publishedPorts: [
      { hostAddress: '127.0.0.1', hostPort: 51000, containerPort: 32000 },
      { hostAddress: '127.0.0.1', hostPort: 51001, containerPort: 32001 },
    ] } };
    expect(parseApplePreviewPortMappings(inspect, buildPreviewInternalPorts(2))).toEqual([
      { internalPort: 32000, hostPort: 51000 },
      { internalPort: 32001, hostPort: 51001 },
    ]);
  });
});
