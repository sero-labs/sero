import type { SessionEntry as PiSessionEntry } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@sero-ai/a2a";

export type TaskStatus = "submitted" | "working" | "input-required" | "auth-required" | "completed" | "failed" | "canceled" | "rejected";
export interface TaskTransition {
  taskId: string; contextId: string; status: TaskStatus; controllerId: string;
  firstEntryId?: string; lastEntryId?: string; updatedAt: string; message?: string;
  input?: ApprovalRequest; artifacts?: TaskArtifact[];
}
export interface ApprovalRequest {
  approvalId: string; toolName: "write" | "edit" | "bash"; input: Record<string, unknown>;
}
export interface TaskArtifact {
  artifactId: string; name: string; parts: Array<{ raw?: string; url?: string; mediaType: string }>;
}
export interface SessionRecord {
  id: string; name: string; model: string; workspace: string; approvalMode: "ask" | "allow";
  thinkingLevel: ThinkingLevel; piSessionPath?: string; createdAt: string; updatedAt: string;
}
export type SessionEntry = PiSessionEntry;
export interface ControllerRecord {
  id: string; profileId: string; salt: string; tokenDigest: string; createdAt: string; revokedAt?: string;
}
export interface EnrolmentRecord { digest: string; expiresAt: number }
export interface ControlError { error: { code: string; message: string } }
export interface AuthenticatedController { id: string; profileId: string }
export interface ProviderStatus { id: string; configured: boolean; source: "environment" | "stored" | "none" }
