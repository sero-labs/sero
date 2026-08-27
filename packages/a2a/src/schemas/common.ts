import { z } from 'zod';

export const EmptySchema = z.object({}).strict();
export const IdSchema = z.string().min(1);
export const TimestampSchema = z.string().datetime({ offset: true });
export const JsonObjectSchema = z.record(z.string(), z.unknown());
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const ThinkingLevelSchema = z.enum(THINKING_LEVELS);

export const CONTROL_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'not_found',
  'conflict',
  'version_mismatch',
  'internal_error',
] as const;

export const ControlErrorCodeSchema = z.enum(CONTROL_ERROR_CODES);

export const ControlErrorDetailSchema = z.object({
  code: ControlErrorCodeSchema,
  message: z.string(),
}).strict();

export const ControlErrorSchema = z.object({
  error: ControlErrorDetailSchema,
}).strict();

export const VersionMismatchError = {
  error: {
    code: 'version_mismatch',
    message: 'Unsupported Sero control protocol version.',
  },
} as const satisfies z.infer<typeof ControlErrorSchema>;

export type ControlError = z.infer<typeof ControlErrorSchema>;
export type ControlErrorCode = z.infer<typeof ControlErrorCodeSchema>;

export const ModelRefSchema = z.object({
  providerId: IdSchema,
  modelId: IdSchema,
}).strict();

export const ModelSchema = z.object({
  providerId: IdSchema,
  modelId: IdSchema,
  name: IdSchema,
  reasoning: z.boolean().default(false),
  availableThinkingLevels: z.array(ThinkingLevelSchema).default(['off']),
}).strict();

export const ControllerSchema = z.object({
  id: IdSchema,
  name: IdSchema,
  createdAt: TimestampSchema,
  lastSeenAt: TimestampSchema.nullable(),
}).strict();

export const SessionSchema = z.object({
  contextId: IdSchema,
  name: z.string(),
  workspace: IdSchema,
  model: ModelRefSchema,
  thinkingLevel: ThinkingLevelSchema.default('off'),
  approvalMode: z.enum(['ask', 'allow']),
  updatedAt: TimestampSchema,
  runningTaskId: IdSchema.nullable(),
}).strict();

export const NodeHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  nodeId: IdSchema,
  nodeName: IdSchema,
  version: IdSchema,
  startedAt: TimestampSchema,
}).strict();

export const OAuthProviderSchema = z.object({
  id: IdSchema,
  name: IdSchema,
  isLoggedIn: z.boolean(),
}).strict();

export const ApiKeyProviderSchema = z.object({
  id: IdSchema,
  name: IdSchema,
  hasKey: z.boolean(),
  fromEnv: z.boolean(),
}).strict();

export type ModelRef = z.infer<typeof ModelRefSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
export type Controller = z.infer<typeof ControllerSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type NodeHealth = z.infer<typeof NodeHealthSchema>;
