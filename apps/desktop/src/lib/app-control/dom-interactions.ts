import type {
  AppInteractionParams,
  AppInteractionResult,
} from '@/types/ipc';
import {
  handleClick,
  handleGetText,
  handleHover,
  handleSelect,
  handleType,
} from './dom/actions';
import { getAppPanel, getAppPanelRect } from './dom/geometry';
import { handleInspect } from './dom/inspect';
import { handleScroll, handleScrollContainers, handleScrollTo } from './dom/scrolling';
import { handleSnapshot, handleVisible } from './dom/snapshot';

export { getAppPanelRect };

export async function executeAppInteraction(
  params: AppInteractionParams,
): Promise<AppInteractionResult> {
  const panel = getAppPanel();
  if (!panel) return { success: false, message: 'App panel not found in DOM' };

  switch (params.action) {
    case 'click':
      return handleClick(panel, params);
    case 'type':
      return handleType(panel, params);
    case 'scroll':
      return handleScroll(panel, params);
    case 'scroll-to':
      return handleScrollTo(panel, params);
    case 'select':
      return handleSelect(panel, params);
    case 'hover':
      return handleHover(panel, params);
    case 'get-text':
      return handleGetText(panel, params);
    case 'inspect':
      return handleInspect(panel, params);
    case 'visible':
      return handleVisible(panel, params);
    case 'snapshot':
      return handleSnapshot(panel);
    case 'scroll-containers':
      return handleScrollContainers(panel, params);
    default:
      return { success: false, message: `Unknown action: ${params.action}` };
  }
}
