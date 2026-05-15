import { assertSafeWorkspaceId } from '../../utils';

export function previewBridgeMarker(workspaceId: string, targetPort: number, internalPort: number): string {
  assertSafeWorkspaceId(workspaceId);
  return `sero-preview-bridge-${workspaceId}-${assertIntegerPort(targetPort, 'targetPort')}-${assertIntegerPort(internalPort, 'internalPort')}`;
}

export function startPreviewBridgeCommand(workspaceId: string, targetPort: number, internalPort: number): string {
  // The numbers below are inlined directly into a `node -e` source string, so any non-integer
  // input would be a JavaScript injection vector. Reject at the boundary even though TypeScript
  // narrows the type — IPC and CLI callers can still surface bad data.
  const safeTargetPort = assertIntegerPort(targetPort, 'targetPort');
  const safeInternalPort = assertIntegerPort(internalPort, 'internalPort');
  const marker = previewBridgeMarker(workspaceId, safeTargetPort, safeInternalPort);
  const script = `
process.title = ${JSON.stringify(marker)};
const net = require('net');
const server = net.createServer((client) => {
  const upstream = net.connect(${safeTargetPort}, '127.0.0.1');
  client.pipe(upstream);
  upstream.pipe(client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
});
server.listen(${safeInternalPort}, '0.0.0.0');
`;
  return `${stopPreviewBridgeCommand(workspaceId, safeTargetPort, safeInternalPort)}; node -e ${shellQuote(script)} >/tmp/${marker}.log 2>&1 &`;
}

export function stopPreviewBridgeCommand(workspaceId: string, targetPort: number, internalPort: number): string {
  const marker = previewBridgeMarker(workspaceId, assertIntegerPort(targetPort, 'targetPort'), assertIntegerPort(internalPort, 'internalPort'));
  return `for pid in $(pgrep -f ${shellQuote(marker)} 2>/dev/null); do [ "$pid" = "$$" ] || kill "$pid" >/dev/null 2>&1 || true; done`;
}

function assertIntegerPort(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`Preview bridge ${name} must be an integer in [1, 65535], received: ${String(value)}`);
  }
  return value;
}

export function previewUrl(hostPort: number, path = ''): string {
  const suffix = path.startsWith('/') || path === '' ? path : `/${path}`;
  return `http://127.0.0.1:${hostPort}${suffix}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
