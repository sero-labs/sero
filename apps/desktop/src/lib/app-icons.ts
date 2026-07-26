import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Calculator,
  CheckSquare,
  ClipboardList,
  Clock,
  Code,
  Columns3,
  Flame,
  Gamepad2,
  GitBranch,
  HeartPulse,
  Image,
  Landmark,
  LayoutDashboard,
  Mail,
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
  clock: Clock,
  code: Code,
  'columns-3': Columns3,
  flame: Flame,
  'gamepad-2': Gamepad2,
  'git-branch': GitBranch,
  'heart-pulse': HeartPulse,
  image: Image,
  landmark: Landmark,
  'layout-dashboard': LayoutDashboard,
  mail: Mail,
  'message-circle-question': MessageCircleQuestion,
  'music-2': Music2,
  'notebook-pen': NotebookPen,
  sparkles: Sparkles,
};

export function getAppIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Box;
  return ICON_REGISTRY[iconName] ?? Box;
}
