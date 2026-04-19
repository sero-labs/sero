import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from './types';

export class KanbanRuntime implements AppRuntime {
  constructor(readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {}

  async handleStateChange(_state: unknown): Promise<void> {}

  async dispose(): Promise<void> {}
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new KanbanRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
