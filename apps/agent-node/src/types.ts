export type TaskStatus = "submitted" | "working" | "input-required" | "auth-required" | "completed" | "failed" | "canceled" | "rejected";
export interface TaskTransition {
  taskId: string; contextId: string; status: TaskStatus; controllerId: string;
  firstEntryId?: string; lastEntryId?: string; updatedAt: string; message?: string;
}
export interface SessionRecord {
  id: string; name: string; model: string; workspace: string; createdAt: string; updatedAt: string;
}
export interface SessionEntry { id: string; parentId: string | null; type: string; role?: string; text?: string; createdAt: string }
export interface ControllerRecord {
  id: string; profileId: string; salt: string; tokenDigest: string; createdAt: string; revokedAt?: string;
}
export interface EnrolmentRecord { digest: string; expiresAt: number }
export interface ControlError { error: { code: string; message: string } }
export interface AuthenticatedController { id: string; profileId: string }
export interface ProviderStatus { id: string; configured: boolean; source: "environment" | "stored" | "none" }
