#!/usr/bin/env node
// Streamable HTTP entry for both protocol eras. Pass --port <n> to pick a port;
// the default is a free port. It prints its URL on the first line of stdout.
import http from 'node:http';
import { createServer, load } from './create-server.mjs';

const { createMcpHandler } = await load('@modelcontextprotocol/server');
const { toNodeHandler } = await load('@modelcontextprotocol/node');

const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 0;
const server = http.createServer(toNodeHandler(createMcpHandler(createServer)));

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`http://127.0.0.1:${server.address().port}/mcp\n`);
});
