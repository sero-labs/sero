export interface ChatCheckpointRef {
  changeId: string;
  description: string;
  source: string;
  createdAt: string;
}

export interface UserCheckpointEvent {
  type: 'user_checkpoint';
  sessionId: string;
  userMessageId: string;
  checkpoint: ChatCheckpointRef;
}
