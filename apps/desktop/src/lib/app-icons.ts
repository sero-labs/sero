import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Calculator,
  CheckSquare,
  ClipboardList,
  Code,
  Flame,
  Gamepad2,
  HeartPulse,
  Image,
  Landmark,
  MessageCircleQuestion,
  Music2,
  NotebookPen,
  Sparkles,
} from 'lucide-react';

const ICON_REGISTRY: Record<string, LucideIcon> = {
  box: Box,
  calculator: Calculator,
  'check-square': CheckSquare,
  'clipboard-list': ClipboardList,
  code: Code,
  flame: Flame,
  'gamepad-2': Gamepad2,
  'heart-pulse': HeartPulse,
  image: Image,
  landmark: Landmark,
  'message-circle-question': MessageCircleQuestion,
  'music-2': Music2,
  'notebook-pen': NotebookPen,
  sparkles: Sparkles,
};

export function getAppIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Box;
  return ICON_REGISTRY[iconName] ?? Box;
}
