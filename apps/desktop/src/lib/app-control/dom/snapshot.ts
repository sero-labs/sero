import type { AppElementInfo, AppInteractionParams, AppInteractionResult } from '@/types/ipc';
import { toAppPanelRect } from './geometry';
import { describeElement } from './inspect';
import { getElementByRef } from './refs';
import { findByText, findInPanel, findSearchRoot, isElementVisible } from './targeting';

function visibleInfos(panel: HTMLElement, panelRect: DOMRect, selector: string): AppElementInfo[] {
  return Array.from(panel.querySelectorAll(selector)).flatMap((element) => {
    if (!isElementVisible(element, panel)) return [];
    const info = describeElement(panelRect, element);
    return info ? [info] : [];
  }).slice(0, 80);
}

function resolveVisibleTarget(panel: HTMLElement, params: AppInteractionParams): Element | null {
  if (params.ref) return getElementByRef(panel, params.ref);
  if (params.selector) return findInPanel(panel, params.selector);
  if (params.text) {
    const root = findSearchRoot(panel, params.withinSelector, params.containerText);
    return root ? findByText(root, params.text) : null;
  }
  return null;
}

export function handleVisible(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const target = resolveVisibleTarget(panel, params);
  if (!target) {
    const query = params.selector ?? params.ref ?? params.text ?? '(missing query)';
    return { success: false, message: `Not visible: ${query}` };
  }

  const visible = isElementVisible(target, panel);
  const label = params.selector ?? params.ref ?? params.text ?? target.tagName.toLowerCase();
  return {
    success: visible,
    message: visible ? `Visible: ${label}` : `Not visible: ${label}`,
  };
}

export function handleSnapshot(panel: HTMLElement): AppInteractionResult {
  const panelRect = panel.getBoundingClientRect();
  const snapshot = {
    panelRect: toAppPanelRect(panelRect),
    headings: visibleInfos(panel, panelRect, 'h1,h2,h3,h4,h5,h6,[role="heading"]'),
    sections: visibleInfos(panel, panelRect, 'section,article,aside,main,[role="region"],[role="main"],[role="complementary"]'),
    buttons: visibleInfos(panel, panelRect, 'button,[role="button"]'),
    links: visibleInfos(panel, panelRect, 'a,[role="link"]'),
    inputs: visibleInfos(panel, panelRect, 'input,textarea,select,[contenteditable="true"]'),
  };
  const count = snapshot.headings.length + snapshot.buttons.length + snapshot.links.length + snapshot.inputs.length;
  return { success: true, message: `Snapshot complete (${count} visible controls/headings)`, snapshot };
}
