#!/usr/bin/env node
// Stdio entry. By default it serves both protocol eras. With --legacy it
// serves only the 2025 initialize handshake.
import { createServer, load } from './create-server.mjs';

const { serveStdio, StdioServerTransport } = await load('@modelcontextprotocol/server/stdio');

if (process.argv.includes('--legacy')) {
  await createServer().connect(new StdioServerTransport());
} else {
  serveStdio(createServer);
}
