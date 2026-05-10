export function previewBridgeMarker(workspaceId: string, targetPort: number, internalPort: number): string {
  return `sero-preview-bridge-${workspaceId}-${targetPort}-${internalPort}`;
}

export function startPreviewBridgeCommand(workspaceId: string, targetPort: number, internalPort: number): string {
  const marker = previewBridgeMarker(workspaceId, targetPort, internalPort);
  const script = `
process.title = ${JSON.stringify(marker)};
const net = require('net');
const server = net.createServer((client) => {
  const upstream = net.connect(${targetPort}, '127.0.0.1');
  client.pipe(upstream);
  upstream.pipe(client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
});
server.listen(${internalPort}, '0.0.0.0');
`;
  return `${stopPreviewBridgeCommand(workspaceId, targetPort, internalPort)}; node -e ${shellQuote(script)} >/tmp/${marker}.log 2>&1 &`;
}

export function stopPreviewBridgeCommand(workspaceId: string, targetPort: number, internalPort: number): string {
  const marker = previewBridgeMarker(workspaceId, targetPort, internalPort);
  return `for pid in $(pgrep -f ${shellQuote(marker)} 2>/dev/null); do [ "$pid" = "$$" ] || kill "$pid" >/dev/null 2>&1 || true; done`;
}

export function previewUrl(hostPort: number, path = ''): string {
  const suffix = path.startsWith('/') || path === '' ? path : `/${path}`;
  return `http://127.0.0.1:${hostPort}${suffix}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
