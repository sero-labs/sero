import { describe, expect, it } from 'vitest';
import { RemoteConversationBoundary, remoteA2aMessage, remoteArtifact, remoteArtifacts, remoteSessionKey } from '@electron/features/agent-node/normalize';

describe('remote conversation normalization', () => {
  it('delivers replay entries, a partial snapshot, and live deltas to one remote session key', () => {
    const key = remoteSessionKey('spark:west', 'session:one');
    const boundary = new RemoteConversationBoundary(key);
    expect(key).toBe('node:spark%3Awest:session%3Aone');
    expect(boundary.accept({ type: 'entry', entry: { id: '1234abcd', parentId: null, data: { role: 'user', text: 'Hello' } } })[0]).toMatchObject({
      type: 'message_start', sessionId: key,
    });
    expect(boundary.accept({ type: 'snapshot', message: { id: 'assistant:partial', role: 'assistant', text: 'Work', partial: true } })[0]).toMatchObject({
      type: 'message_start', sessionId: key,
    });
    expect(boundary.accept({ type: 'delta', text: 'ing' })[0]).toEqual({
      type: 'text_delta', sessionId: key, messageId: 'assistant:partial', delta: 'ing',
    });
  });

  it('normalizes A2A 1.0 role and task-state enum names', () => {
    const boundary = new RemoteConversationBoundary(remoteSessionKey('n', 's'));
    expect(boundary.accept({ role: 'ROLE_AGENT', id: 'a', text: 'Done' })[0]).toMatchObject({ type: 'message_start' });
    expect(boundary.accept({ status: { state: 'TASK_STATE_COMPLETED' } })[0]).toMatchObject({ type: 'agent_end' });
  });

  it('puts mid-turn queue behavior in the node-owned metadata field', () => {
    expect(remoteA2aMessage({ nodeId: 'n', contextId: 's', text: 'Change it', mode: 'steer' }, 'm')).toMatchObject({
      contextId: 's', role: 'ROLE_USER', parts: [{ text: 'Change it' }], metadata: { 'sero:queue-mode': 'steer' },
    });
    expect(remoteA2aMessage({ nodeId: 'n', contextId: 's', text: 'Next', mode: 'followUp' }, 'm')).toMatchObject({
      metadata: { 'sero:queue-mode': 'followUp' },
    });
  });

  it('serializes node-owned approval replies as A2A data parts', () => {
    expect(remoteA2aMessage({
      nodeId: 'n', contextId: 's', text: '', approval: { id: 'approval-1', approved: true, scope: 'task' },
    }, 'm')).toMatchObject({
      parts: expect.arrayContaining([{ data: { type: 'approval_response', approvalId: 'approval-1', approved: true, scope: 'task' } }]),
    });
  });

  it('renders Pi message content and starts the first live assistant delta', () => {
    const boundary = new RemoteConversationBoundary(remoteSessionKey('n', 's'));
    expect(boundary.accept({
      type: 'entry', entry: { id: 'entry-1', parentId: null, data: { message: { role: 'user', content: 'Hello' } } },
    })[0]).toMatchObject({ type: 'message_start', message: { text: 'Hello' } });
    expect(boundary.accept({ type: 'delta', delta: { messageId: 'task-1', delta: 'Working' } })[0])
      .toMatchObject({ type: 'message_start', message: { id: 'task-1', text: 'Working' } });
  });

  it('unwraps canonical SDK response and stream payloads', () => {
    const boundary = new RemoteConversationBoundary(remoteSessionKey('n', 's'));
    expect(boundary.accept({ result: { task: { status: { state: 'TASK_STATE_WORKING' } } } })[0])
      .toMatchObject({ type: 'agent_start' });
    expect(boundary.accept({ result: { statusUpdate: { status: { state: 'TASK_STATE_COMPLETED' } } } })[0])
      .toMatchObject({ type: 'agent_end' });
  });

  it('keeps authenticated artifact URLs and credentials out of renderer data', () => {
    expect(remoteArtifact({ artifact: { artifactId: 'a1', name: 'Report', parts: [{
      mediaType: 'text/plain', content: { $case: 'url', value: 'https://spark/sero/v1/blob/blob-1' },
    }] } })).toEqual({ id: 'a1', name: 'Report', mediaType: 'text/plain', blobId: 'blob-1' });
    expect(remoteArtifact({ artifact: { artifactId: 'a2', name: 'Small', parts: [{
      mediaType: 'text/plain', content: { $case: 'raw', value: 'aGVsbG8=' },
    }] } })).toEqual({ id: 'a2', name: 'Small', mediaType: 'text/plain', inlineBase64: 'aGVsbG8=' });
    expect(remoteArtifacts({ result: { task: { artifacts: [{ artifactId: 'a3', name: 'Task output', parts: [{
      mediaType: 'text/plain', raw: 'dGFzaw==',
    }] }] } } })).toEqual([{ id: 'a3', name: 'Task output', mediaType: 'text/plain', inlineBase64: 'dGFzaw==' }]);
    expect(remoteArtifacts({ result: { task: { artifacts: [{ artifactId: 'a4', name: 'bash-call_123.json', parts: [{
      mediaType: 'application/json', raw: 'e30=',
    }] }] } } })).toEqual([]);
  });
});
