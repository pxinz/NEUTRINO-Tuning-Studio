import { describe, expect, it } from 'vitest';
import { formatShortcut, matchesShortcut, shortcutFromEvent } from '../src/lib/shortcuts';

function keyEvent(key: string, mods: Partial<KeyboardEvent> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe('keyboard shortcuts', () => {
  it('matches Ctrl/Cmd and rejects modifiers that were not requested', () => {
    expect(matchesShortcut(keyEvent('Enter', { ctrlKey: true }), 'Mod+Enter')).toBe(true);
    expect(matchesShortcut(keyEvent('Enter', { metaKey: true }), 'Mod+Enter')).toBe(true);
    expect(matchesShortcut(keyEvent('Enter'), 'Mod+Enter')).toBe(false);
    expect(matchesShortcut(keyEvent(' ', { shiftKey: true }), 'Space')).toBe(false);
    expect(matchesShortcut(keyEvent(' ', { shiftKey: true }), 'Shift+Space')).toBe(true);
  });

  it('matches single-key tool shortcuts without intercepting modified keys', () => {
    expect(matchesShortcut(keyEvent('v'), 'V')).toBe(true);
    expect(matchesShortcut(keyEvent('b'), 'B')).toBe(true);
    expect(matchesShortcut(keyEvent('e'), 'E')).toBe(true);
    expect(matchesShortcut(keyEvent('v', { ctrlKey: true }), 'V')).toBe(false);
  });

  it('formats modifier names and Enter clearly', () => {
    expect(formatShortcut('Mod+Enter', false)).toBe('Ctrl+Enter');
    expect(formatShortcut('Mod+Shift+S', false)).toBe('Ctrl+Shift+S');
    expect(formatShortcut('Mod+Enter', true)).toBe('⌘Enter');
    expect(formatShortcut('', false)).toBe('—');
  });

  it('records a combination in portable Mod form', () => {
    expect(shortcutFromEvent(keyEvent('Enter', { ctrlKey: true }))).toBe('Mod+Enter');
    expect(shortcutFromEvent(keyEvent('b'))).toBe('B');
    expect(shortcutFromEvent(keyEvent('Shift'))).toBeNull();
  });
});
