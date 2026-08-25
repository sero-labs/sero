import { z } from 'zod';
import type { ControlOperationName } from '../constants';
import {
  ApiKeyProviderSchema,
  ControllerSchema,
  EmptySchema,
  IdSchema,
  ModelRefSchema,
  ModelSchema,
  NodeHealthSchema,
  OAuthProviderSchema,
  SessionSchema,
  TimestampSchema,
} from './common';

const ProviderRequestSchema = z.object({ providerId: IdSchema }).strict();
const ResponseRequestSchema = z.object({ value: z.string() }).strict();
const OkSchema = z.object({ ok: z.literal(true) }).strict();
const AcceptedSchema = z.object({ accepted: z.boolean() }).strict();

export const ControlOperationSchemas = {
  enrol: {
    request: z.object({ code: IdSchema, controllerName: IdSchema }).strict(),
    response: z.object({ controllerId: IdSchema, token: IdSchema }).strict(),
  },
  mintEnrolmentCode: {
    request: EmptySchema,
    response: z.object({ code: IdSchema, expiresAt: TimestampSchema }).strict(),
  },
  listControllers: {
    request: EmptySchema,
    response: z.object({ controllers: z.array(ControllerSchema) }).strict(),
  },
  revokeController: {
    request: z.object({ controllerId: IdSchema }).strict(),
    response: OkSchema,
  },
  listSessions: {
    request: EmptySchema,
    response: z.object({ sessions: z.array(SessionSchema) }).strict(),
  },
  createSession: {
    request: z.object({ workspace: IdSchema, model: ModelRefSchema, name: z.string().optional() }).strict(),
    response: z.object({ session: SessionSchema }).strict(),
  },
  deleteSession: {
    request: z.object({ contextId: IdSchema }).strict(),
    response: OkSchema,
  },
  setSessionModel: {
    request: z.object({ contextId: IdSchema, model: ModelRefSchema }).strict(),
    response: z.object({ session: SessionSchema }).strict(),
  },
  setSessionApprovalMode: {
    request: z.object({ contextId: IdSchema, approvalMode: z.enum(['ask', 'allow']) }).strict(),
    response: z.object({ session: SessionSchema }).strict(),
  },
  getNodeHealth: {
    request: EmptySchema,
    response: z.object({ health: NodeHealthSchema }).strict(),
  },
  getProviders: {
    request: EmptySchema,
    response: z.object({
      oauth: z.array(OAuthProviderSchema),
      apiKey: z.array(ApiKeyProviderSchema),
      models: z.array(ModelSchema),
    }).strict(),
  },
  login: { request: ProviderRequestSchema, response: OkSchema },
  logout: { request: ProviderRequestSchema, response: OkSchema },
  setApiKey: {
    request: z.object({ providerId: IdSchema, key: IdSchema }).strict(),
    response: OkSchema,
  },
  removeApiKey: { request: ProviderRequestSchema, response: OkSchema },
  respondPrompt: { request: ResponseRequestSchema, response: AcceptedSchema },
  respondSelect: { request: ResponseRequestSchema, response: AcceptedSchema },
  respondManualCode: { request: ResponseRequestSchema, response: AcceptedSchema },
  cancel: { request: EmptySchema, response: OkSchema },
} as const satisfies Record<ControlOperationName, {
  request: z.ZodType;
  response: z.ZodType;
}>;

export type ControlRequest<Name extends ControlOperationName> =
  z.infer<(typeof ControlOperationSchemas)[Name]['request']>;

export type ControlResponse<Name extends ControlOperationName> =
  z.infer<(typeof ControlOperationSchemas)[Name]['response']>;

export const EnrolRequestSchema = ControlOperationSchemas.enrol.request;
export const EnrolResponseSchema = ControlOperationSchemas.enrol.response;
export const MintEnrolmentCodeRequestSchema = ControlOperationSchemas.mintEnrolmentCode.request;
export const MintEnrolmentCodeResponseSchema = ControlOperationSchemas.mintEnrolmentCode.response;
export const ListControllersRequestSchema = ControlOperationSchemas.listControllers.request;
export const ListControllersResponseSchema = ControlOperationSchemas.listControllers.response;
export const RevokeControllerRequestSchema = ControlOperationSchemas.revokeController.request;
export const RevokeControllerResponseSchema = ControlOperationSchemas.revokeController.response;
export const ListSessionsRequestSchema = ControlOperationSchemas.listSessions.request;
export const ListSessionsResponseSchema = ControlOperationSchemas.listSessions.response;
export const CreateSessionRequestSchema = ControlOperationSchemas.createSession.request;
export const CreateSessionResponseSchema = ControlOperationSchemas.createSession.response;
export const DeleteSessionRequestSchema = ControlOperationSchemas.deleteSession.request;
export const DeleteSessionResponseSchema = ControlOperationSchemas.deleteSession.response;
export const SetSessionModelRequestSchema = ControlOperationSchemas.setSessionModel.request;
export const SetSessionModelResponseSchema = ControlOperationSchemas.setSessionModel.response;
export const SetSessionApprovalModeRequestSchema = ControlOperationSchemas.setSessionApprovalMode.request;
export const SetSessionApprovalModeResponseSchema = ControlOperationSchemas.setSessionApprovalMode.response;
export const GetNodeHealthRequestSchema = ControlOperationSchemas.getNodeHealth.request;
export const GetNodeHealthResponseSchema = ControlOperationSchemas.getNodeHealth.response;
export const GetProvidersRequestSchema = ControlOperationSchemas.getProviders.request;
export const GetProvidersResponseSchema = ControlOperationSchemas.getProviders.response;
export const LoginRequestSchema = ControlOperationSchemas.login.request;
export const LoginResponseSchema = ControlOperationSchemas.login.response;
export const LogoutRequestSchema = ControlOperationSchemas.logout.request;
export const LogoutResponseSchema = ControlOperationSchemas.logout.response;
export const SetApiKeyRequestSchema = ControlOperationSchemas.setApiKey.request;
export const SetApiKeyResponseSchema = ControlOperationSchemas.setApiKey.response;
export const RemoveApiKeyRequestSchema = ControlOperationSchemas.removeApiKey.request;
export const RemoveApiKeyResponseSchema = ControlOperationSchemas.removeApiKey.response;
export const RespondPromptRequestSchema = ControlOperationSchemas.respondPrompt.request;
export const RespondPromptResponseSchema = ControlOperationSchemas.respondPrompt.response;
export const RespondSelectRequestSchema = ControlOperationSchemas.respondSelect.request;
export const RespondSelectResponseSchema = ControlOperationSchemas.respondSelect.response;
export const RespondManualCodeRequestSchema = ControlOperationSchemas.respondManualCode.request;
export const RespondManualCodeResponseSchema = ControlOperationSchemas.respondManualCode.response;
export const CancelRequestSchema = ControlOperationSchemas.cancel.request;
export const CancelResponseSchema = ControlOperationSchemas.cancel.response;

export type EnrolRequest = ControlRequest<'enrol'>;
export type EnrolResponse = ControlResponse<'enrol'>;
export type MintEnrolmentCodeRequest = ControlRequest<'mintEnrolmentCode'>;
export type MintEnrolmentCodeResponse = ControlResponse<'mintEnrolmentCode'>;
export type ListControllersRequest = ControlRequest<'listControllers'>;
export type ListControllersResponse = ControlResponse<'listControllers'>;
export type RevokeControllerRequest = ControlRequest<'revokeController'>;
export type RevokeControllerResponse = ControlResponse<'revokeController'>;
export type ListSessionsRequest = ControlRequest<'listSessions'>;
export type ListSessionsResponse = ControlResponse<'listSessions'>;
export type CreateSessionRequest = ControlRequest<'createSession'>;
export type CreateSessionResponse = ControlResponse<'createSession'>;
export type DeleteSessionRequest = ControlRequest<'deleteSession'>;
export type DeleteSessionResponse = ControlResponse<'deleteSession'>;
export type SetSessionModelRequest = ControlRequest<'setSessionModel'>;
export type SetSessionModelResponse = ControlResponse<'setSessionModel'>;
export type SetSessionApprovalModeRequest = ControlRequest<'setSessionApprovalMode'>;
export type SetSessionApprovalModeResponse = ControlResponse<'setSessionApprovalMode'>;
export type GetNodeHealthRequest = ControlRequest<'getNodeHealth'>;
export type GetNodeHealthResponse = ControlResponse<'getNodeHealth'>;
export type GetProvidersRequest = ControlRequest<'getProviders'>;
export type GetProvidersResponse = ControlResponse<'getProviders'>;
export type LoginRequest = ControlRequest<'login'>;
export type LoginResponse = ControlResponse<'login'>;
export type LogoutRequest = ControlRequest<'logout'>;
export type LogoutResponse = ControlResponse<'logout'>;
export type SetApiKeyRequest = ControlRequest<'setApiKey'>;
export type SetApiKeyResponse = ControlResponse<'setApiKey'>;
export type RemoveApiKeyRequest = ControlRequest<'removeApiKey'>;
export type RemoveApiKeyResponse = ControlResponse<'removeApiKey'>;
export type RespondPromptRequest = ControlRequest<'respondPrompt'>;
export type RespondPromptResponse = ControlResponse<'respondPrompt'>;
export type RespondSelectRequest = ControlRequest<'respondSelect'>;
export type RespondSelectResponse = ControlResponse<'respondSelect'>;
export type RespondManualCodeRequest = ControlRequest<'respondManualCode'>;
export type RespondManualCodeResponse = ControlResponse<'respondManualCode'>;
export type CancelRequest = ControlRequest<'cancel'>;
export type CancelResponse = ControlResponse<'cancel'>;
