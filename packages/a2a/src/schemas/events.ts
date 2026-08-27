import { z } from 'zod';
import { IdSchema, JsonObjectSchema, NodeHealthSchema } from './common';
import type { ControlStreamName } from '../constants';

export const NodeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('health'), health: NodeHealthSchema }).strict(),
  z.object({
    type: z.literal('presence'),
    contextId: IdSchema,
    controllerIds: z.array(IdSchema),
  }).strict(),
]);

const SessionPositionSchema = z.object({
  id: IdSchema,
  parentId: IdSchema.nullable(),
}).strict();

export const SessionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('entry'),
    entry: SessionPositionSchema.extend({ data: JsonObjectSchema }),
  }).strict(),
  z.object({
    type: z.literal('snapshot'),
    taskId: IdSchema,
    message: JsonObjectSchema,
  }).strict(),
  z.object({
    type: z.literal('delta'),
    taskId: IdSchema,
    delta: JsonObjectSchema,
  }).strict(),
  z.object({ type: z.literal('resync') }).strict(),
  z.object({ type: z.literal('synced') }).strict(),
]);

export const AuthEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), url: z.url(), instructions: z.string().optional() }).strict(),
  z.object({
    type: z.literal('device_code'),
    verificationUri: z.url(),
    userCode: IdSchema,
    expiresInSeconds: z.number().int().positive(),
  }).strict(),
  z.object({ type: z.literal('prompt'), message: z.string(), placeholder: z.string().optional() }).strict(),
  z.object({
    type: z.literal('select'),
    message: z.string(),
    options: z.array(z.object({ id: IdSchema, label: z.string() }).strict()),
  }).strict(),
  z.object({ type: z.literal('manual_input'), prompt: z.string() }).strict(),
  z.object({ type: z.literal('waiting'), message: z.string() }).strict(),
  z.object({ type: z.literal('progress'), message: z.string() }).strict(),
  z.object({ type: z.literal('success'), provider: IdSchema, message: z.string() }).strict(),
  z.object({ type: z.literal('error'), provider: IdSchema, message: z.string() }).strict(),
  z.object({ type: z.literal('cancelled') }).strict(),
]);

export const ControlStreamSchemas = {
  nodeEvents: {
    request: z.object({}).strict(),
    event: NodeEventSchema,
  },
  sessionEvents: {
    request: z.object({ contextId: IdSchema, cursor: IdSchema.optional() }).strict(),
    event: SessionEventSchema,
  },
  authEvents: {
    request: z.object({}).strict(),
    event: AuthEventSchema,
  },
} as const satisfies Record<ControlStreamName, {
  request: z.ZodType;
  event: z.ZodType;
}>;

export type ControlStreamRequest<Name extends ControlStreamName> =
  z.infer<(typeof ControlStreamSchemas)[Name]['request']>;

export type ControlStreamEvent<Name extends ControlStreamName> =
  z.infer<(typeof ControlStreamSchemas)[Name]['event']>;

export type NodeEvent = z.infer<typeof NodeEventSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type AuthEvent = z.infer<typeof AuthEventSchema>;
