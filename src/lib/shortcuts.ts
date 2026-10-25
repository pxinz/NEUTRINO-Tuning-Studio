import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export type ShortcutAction =
  | 'playPause'
  | 'stop'
  | 'toolSelect'
  | 'toolPencil'
  | 'toolEraser'
  | 'render'
  | 'newProject'
  | 'openProject'
  | 'saveProject'
  | 'saveAs'
  | 'undo'
  | 'redo'
  | 'toggleLoop'
  | 'toggleFollow'
  | 'tabScore'
  | 'tabTiming'
  | 'tabPitch'
  | 'tabDynamics'
  | 'toggleLog';

export type ShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'playPause',
  'stop',
  'toolSelect',
  'toolPencil',
  'toolEraser',
  'render',
  'newProject',
  'openProject',
  'saveProject',
  'saveAs',
  'undo',
  'redo',
  'toggleLoop',
  'toggleFollow',
  'tabScore',
  'tabTiming',
  'tabPitch',
  'tabDynamics',
  'toggleLog',
];

export const SHORTCUT_DEFAULTS: ShortcutMap = {
  playPause: 'Space',
  stop: 'Shift+Space',
  toolSelect: 'V',
  toolPencil: 'B',
  toolEraser: 'E',
  render: 'Mod+Enter',
  newProject: 'Mod+N',
  openProject: 'Mod+O',
  saveProject: 'Mod+S',
  saveAs: 'Mod+Shift+S',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  toggleLoop: 'Alt+L',
  toggleFollow: 'Alt+F',
  tabScore: 'Mod+1',
  tabTiming: 'Mod+2',
  tabPitch: 'Mod+3',
  tabDynamics: 'Mod+4',
  toggleLog: 'Mod+L',
};

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function shortcutFromEvent(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  if (event.key === 'Escape') return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Mod');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  let key = event.key;
  if (key === ' ') key = 'Space';
  if (!key) return null;
  if (key.length === 1) key = key.toUpperCase();
  return [...parts, key].join('+');
}

export function matchesShortcut(event: KeyboardEvent | ReactKeyboardEvent, binding: string): boolean {
  if (!binding) return false;
  const parts = binding.split('+');
  const key = parts[parts.length - 1];
  const wantsMod = parts.includes('Mod') || parts.includes('Ctrl') || parts.includes('Meta');
  const wantsAlt = parts.includes('Alt');
  const wantsShift = parts.includes('Shift');
  if ((event.ctrlKey || event.metaKey) !== wantsMod) return false;
  if (event.altKey !== wantsAlt) return false;
  if (event.shiftKey !== wantsShift) return false;
  let eventKey = event.key;
  if (eventKey === ' ') eventKey = 'Space';
  if (eventKey.length === 1 && key.length === 1) {
    return eventKey.toUpperCase() === key.toUpperCase();
  }
  return eventKey === key;
}

export function formatShortcut(binding: string, isMac: boolean): string {
  if (!binding) return '—';
  return binding
    .split('+')
    .map((part) => {
      if (part === 'Mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'Alt') return isMac ? '⌥' : 'Alt';
      if (part === 'Shift') return isMac ? '⇧' : 'Shift';
      if (part === 'Enter') return 'Enter';
      if (part === 'Space') return 'Space';
      return part;
    })
    .join(isMac ? '' : '+');
}

export function labelKeyFor(action: ShortcutAction): string {
  return `shortcut.${action}`;
}
