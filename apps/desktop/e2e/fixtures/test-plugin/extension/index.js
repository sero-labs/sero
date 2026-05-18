const fs = require('node:fs');
const path = require('node:path');

const statePath = () => path.join(process.env.SERO_HOME || process.cwd(), 'apps', 'e2e-test-plugin', 'state.json');

function readState() {
  const filePath = statePath();
  if (!fs.existsSync(filePath)) return { value: null, writes: 0 };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeState(value) {
  const filePath = statePath();
  const previous = readState();
  const next = { value, writes: Number(previous.writes || 0) + 1 };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, filePath);
  return next;
}

function textResult(text, details = {}) {
  return { content: [{ type: 'text', text }], details };
}

module.exports = function e2eTestPlugin(pi) {
  pi.registerTool({
    name: 'e2e_test_plugin',
    label: 'E2E Test Plugin',
    description: 'Deterministic synthetic plugin tool for Sero E2E tests.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write', 'echo'] },
        value: { type: 'string' }
      },
      required: ['action']
    },
    async execute(_toolCallId, params) {
      const action = params && typeof params.action === 'string' ? params.action : '';
      if (action === 'read') {
        const state = readState();
        return textResult(JSON.stringify(state), { state });
      }
      if (action === 'write') {
        const state = writeState(typeof params.value === 'string' ? params.value : '');
        return textResult(`wrote: ${state.value}`, { state });
      }
      if (action === 'echo') {
        return textResult(`echo: ${typeof params.value === 'string' ? params.value : ''}`);
      }
      return textResult(`Error: Unsupported action ${action || '(missing)'}`, { isError: true });
    }
  });
};
