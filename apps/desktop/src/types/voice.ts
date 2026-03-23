/** Voice transcription availability for renderer UI gating. */
export interface VoiceTranscriptionStatus {
  enabled: boolean;
  reason?: string;
}

/** Result returned from the voice transcription endpoint. */
export interface VoiceTranscriptionResult {
  text: string;
  model: string;
}
