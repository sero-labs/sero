import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AgentCard } from '@a2a-js/sdk';
import {
  A2A_VERSION_HEADER,
  CONTROL_OPERATION_BOUNDARIES,
  CONTROL_OPERATION_NAMES,
  CONTROL_STREAM_BOUNDARIES,
  CONTROL_STREAM_NAMES,
  ControlErrorSchema,
  ControlOperationSchemas,
  ControlStreamSchemas,
  SERO_A2A_OPERATION_NAMES,
  SERO_A2A_VERSION,
  SERO_BEARER_SCHEME,
  SERO_CONTROL_VERSION,
  SERO_CONTROL_VERSION_HEADER,
  SERO_EXTENSION_URI,
  SessionEventSchema,
  VersionMismatchError,
  a2aVersionHeaders,
  controlVersionHeaders,
  createSeroAgentCard,
  getSeroExtension,
  hasA2AVersion,
  hasControlVersion,
} from './index';

const cardBase = {
  name: 'spark',
  description: 'Sero Agent Node',
  provider: undefined,
  version: '0.1.0',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  skills: [],
  signatures: [],
};

describe('A2A 1.0 card contract', () => {
  it('uses the canonical card type and declares the adjacent optional extension', () => {
    const card = createSeroAgentCard({
      card: cardBase,
      a2aUrl: 'https://spark.example/',
      controlUrl: 'https://spark.example/sero/v1',
      tenant: '',
      tools: ['read', 'bash'],
    });

    expectTypeOf(card).toEqualTypeOf<AgentCard>();
    expect(card.supportedInterfaces).toEqual([{
      url: 'https://spark.example/',
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
      tenant: '',
    }]);
    expect(card.capabilities?.extensions).toEqual([{
      uri: SERO_EXTENSION_URI,
      description: 'Sero control plane and declared node tool surface.',
      required: false,
      params: { url: 'https://spark.example/sero/v1', tools: ['read', 'bash'] },
    }]);
    expect(card.securitySchemes[SERO_BEARER_SCHEME]?.scheme?.$case)
      .toBe('httpAuthSecurityScheme');
    expect(card.securityRequirements[0]?.schemes).toHaveProperty(SERO_BEARER_SCHEME);
    expect(getSeroExtension(card)?.params.tools).toEqual(['read', 'bash']);
  });

  it('requires explicit A2A 1.0 and control version 1 headers', () => {
    expect(a2aVersionHeaders()).toEqual({ [A2A_VERSION_HEADER]: SERO_A2A_VERSION });
    expect(controlVersionHeaders()).toEqual({
      [SERO_CONTROL_VERSION_HEADER]: SERO_CONTROL_VERSION,
    });
    expect(hasA2AVersion(new Headers())).toBe(false);
    expect(hasA2AVersion(new Headers({ [A2A_VERSION_HEADER]: '0.3' }))).toBe(false);
    expect(hasA2AVersion(new Headers(a2aVersionHeaders()))).toBe(true);
    expect(hasControlVersion(new Headers())).toBe(false);
    expect(hasControlVersion(new Headers({ [SERO_CONTROL_VERSION_HEADER]: '2' }))).toBe(false);
    expect(hasControlVersion(new Headers(controlVersionHeaders()))).toBe(true);
    expect(ControlErrorSchema.parse(VersionMismatchError)).toEqual(VersionMismatchError);
  });
});

describe('control-plane boundary contract', () => {
  it('records all 18 operation gaps and all three stream gaps', () => {
    expect(Object.keys(CONTROL_OPERATION_BOUNDARIES)).toEqual(CONTROL_OPERATION_NAMES);
    expect(Object.keys(CONTROL_STREAM_BOUNDARIES)).toEqual(CONTROL_STREAM_NAMES);
    expect(Object.values(CONTROL_OPERATION_BOUNDARIES)).toSatisfy(
      (entries: Array<{ boundary: string; gap: string }>) =>
        entries.every(({ boundary, gap }) => boundary === 'control-plane' && gap.length > 0),
    );
  });

  it('keeps A2A methods out of the adjacent control router', () => {
    const controlNames = new Set<string>(CONTROL_OPERATION_NAMES);
    expect(SERO_A2A_OPERATION_NAMES.every((name) => !controlNames.has(name))).toBe(true);
  });

  it('has strict runtime request and response schemas for every operation', () => {
    expect(Object.keys(ControlOperationSchemas)).toEqual(CONTROL_OPERATION_NAMES);
    for (const { request, response } of Object.values(ControlOperationSchemas)) {
      expect(request.safeParse({ unexpected: true }).success).toBe(false);
      expect(response.safeParse({ unexpected: true }).success).toBe(false);
    }
  });

  it('has request and event schemas for every stream', () => {
    expect(Object.keys(ControlStreamSchemas)).toEqual(CONTROL_STREAM_NAMES);
    expect(ControlStreamSchemas.sessionEvents.request.parse({
      contextId: 'session-1', cursor: 'deadbeef',
    })).toEqual({ contextId: 'session-1', cursor: 'deadbeef' });
    expect(SessionEventSchema.parse({ type: 'resync' })).toEqual({ type: 'resync' });
  });

  it('uses one strict common error envelope', () => {
    expect(ControlErrorSchema.parse({ error: { code: 'not_found', message: 'Not found' } }))
      .toEqual({ error: { code: 'not_found', message: 'Not found' } });
    expect(ControlErrorSchema.safeParse({ code: 'not_found', message: 'Not found' }).success)
      .toBe(false);
    expect(ControlErrorSchema.safeParse({
      error: { code: 'not_found', message: 'Not found', detail: 'secret' },
    }).success).toBe(false);
    expect(ControlErrorSchema.safeParse({
      error: { code: 'provider_secret', message: 'Do not expose implementation errors' },
    }).success).toBe(false);
  });
});
