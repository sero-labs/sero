export const appAgentIpcChannels = {
  /** Send a prompt to an app's dedicated agent session. Returns text response. */
  prompt: 'sero:app-agent:prompt',
  /** Send a prompt and stream text deltas back. Returns final text. */
  promptStream: 'sero:app-agent:prompt-stream',
  /** Run an app-local extension tool directly. Returns structured tool output. */
  invokeTool: 'sero:app-agent:invoke-tool',
  /** Push channel for text deltas during streaming. */
  streamEvent: 'sero:app-agent:stream-event',
};
