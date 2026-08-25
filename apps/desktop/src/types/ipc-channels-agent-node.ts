export const agentNodeIpcChannels = {
  list: 'sero:agent-node:list',
  enrol: 'sero:agent-node:enrol',
  remove: 'sero:agent-node:remove',
  connect: 'sero:agent-node:connect',
  control: 'sero:agent-node:control',
  send: 'sero:agent-node:send',
  getTask: 'sero:agent-node:get-task',
  cancelTask: 'sero:agent-node:cancel-task',
  attach: 'sero:agent-node:attach',
  readBlob: 'sero:agent-node:read-blob',
  event: 'sero:agent-node:event',
} as const;
