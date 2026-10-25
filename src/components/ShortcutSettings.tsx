import React, { useMemo, useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_DEFAULTS,
  formatShortcut,
  labelKeyFor,
  shortcutFromEvent,
  type ShortcutAction,
  type ShortcutMap,
} from '../lib/shortcuts';

export default function ShortcutSettings({
  value,
  onChange,
  isMac,
}: {
  value: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
  isMac: boolean;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState<ShortcutAction | null>(null);

  const duplicates = useMemo(() => {
    const seen = new Map<string, ShortcutAction[]>();
    for (const action of SHORTCUT_ACTIONS) {
      const binding = value[action];
      if (!binding) continue;
      const list = seen.get(binding) || [];
      list.push(action);
      seen.set(binding, list);
    }
    return new Set(
      [...seen.values()].filter((actions) => actions.length > 1).flat(),
    );
  }, [value]);

  const update = (action: ShortcutAction, binding: string) => {
    onChange({ ...value, [action]: binding });
  };

  const record = (action: ShortcutAction, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(null);
      return;
    }
    if (event.key === 'Backspace' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      update(action, '');
      setRecording(null);
      return;
    }
    const binding = shortcutFromEvent(event);
    if (!binding) return;
    update(action, binding);
    setRecording(null);
  };

  return (
    <div className="shortcut-settings">
      <div className="shortcut-intro">
        <Keyboard size={16} />
        <span>{t('settings.shortcutHint')}</span>
      </div>
      {duplicates.size ? <div className="shortcut-warning">{t('settings.shortcutDuplicate')}</div> : null}
      <div className="shortcut-list">
        {SHORTCUT_ACTIONS.map((action) => (
          <div key={action} className={duplicates.has(action) ? 'shortcut-row conflict' : 'shortcut-row'}>
            <span className="shortcut-label">{t(labelKeyFor(action))}</span>
            <button
              type="button"
              data-shortcut-recorder="true"
              className={recording === action ? 'shortcut-capture recording' : 'shortcut-capture'}
              onClick={() => setRecording(recording === action ? null : action)}
              onKeyDown={(event) => record(action, event)}
              onBlur={() => {
                if (recording === action) setRecording(null);
              }}
              aria-label={t(labelKeyFor(action))}
            >
              {recording === action ? t('settings.shortcutRecording') : formatShortcut(value[action], isMac)}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="shortcut-reset"
        onClick={() => {
          onChange({ ...SHORTCUT_DEFAULTS });
          setRecording(null);
        }}
      >
        <RotateCcw size={13} />
        {t('settings.shortcutReset')}
      </button>
    </div>
  );
}
