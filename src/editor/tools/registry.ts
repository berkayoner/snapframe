import {
  Circle,
  Crop,
  Droplet,
  Focus,
  Highlighter,
  ListOrdered,
  MousePointer2,
  MoveUpRight,
  Square,
  Type,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { EditorTool } from '@/src/editor/store/editorStore';
import type { MessageKey } from '@/src/shared/i18n';

export interface ToolDefinition {
  id: EditorTool;
  icon: LucideIcon;
  /** Single-key shortcut (no modifiers). */
  key: string;
  label: MessageKey;
  /** Toolbar group, rendered with separators between groups. */
  group: 'pointer' | 'draw' | 'focus' | 'redact';
}

export const TOOLS: ToolDefinition[] = [
  { id: 'select', icon: MousePointer2, key: 'V', label: 'toolSelect', group: 'pointer' },
  { id: 'crop', icon: Crop, key: 'C', label: 'toolCrop', group: 'pointer' },
  { id: 'rectangle', icon: Square, key: 'R', label: 'toolRectangle', group: 'draw' },
  { id: 'ellipse', icon: Circle, key: 'O', label: 'toolEllipse', group: 'draw' },
  { id: 'arrow', icon: MoveUpRight, key: 'A', label: 'toolArrow', group: 'draw' },
  { id: 'text', icon: Type, key: 'T', label: 'toolText', group: 'draw' },
  { id: 'step', icon: ListOrdered, key: 'N', label: 'toolStep', group: 'draw' },
  { id: 'magnify', icon: ZoomIn, key: 'M', label: 'toolMagnify', group: 'focus' },
  { id: 'spotlight', icon: Focus, key: 'F', label: 'toolSpotlight', group: 'focus' },
  { id: 'highlight', icon: Highlighter, key: 'H', label: 'toolHighlight', group: 'redact' },
  { id: 'blur', icon: Droplet, key: 'B', label: 'toolBlur', group: 'redact' },
];

export function toolForKey(key: string): EditorTool | undefined {
  const upper = key.toUpperCase();
  return TOOLS.find((tool) => tool.key === upper)?.id;
}

/** "Ctrl" on Windows/Linux, "⌘" on macOS - for displaying shortcuts. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
