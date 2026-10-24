import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ExternalLink, Keyboard, Sparkles } from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button } from './ui';

const SHORTCUTS: Array<[string, string]> = [
  ['help.shortcut.space', 'Space'],
  ['help.shortcut.render', 'Ctrl + Enter'],
  ['help.shortcut.save', 'Ctrl + S'],
  ['help.shortcut.undo', 'Ctrl + Z'],
  ['help.shortcut.redo', 'Ctrl + Shift + Z'],
  ['help.shortcut.delete', 'Delete / Backspace'],
  ['help.shortcut.tabs', 'Ctrl + 1…4'],
  ['help.shortcut.zoom', 'Ctrl + Wheel'],
];

export default function HelpModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'help');
  const setModal = useAppStore((s) => s.setModal);
  return (
    <Modal
      open={open}
      title={t('help.title')}
      onClose={() => setModal(null)}
      width={820}
      footer={<Button variant="primary" onClick={() => setModal(null)}>{t('common.close')}</Button>}
    >
      <div className="help-layout">
        <div className="help-intro">
          <Sparkles size={18} />
          <p>{t('help.intro')}</p>
        </div>
        <div className="help-steps">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="help-step">
              <span className="help-step-num">{n}</span>
              <div>
                <strong>{t(`help.step${n}.title`)}</strong>
                <p>{t(`help.step${n}.body`)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="help-shortcuts">
          <h3><Keyboard size={15} /> {t('help.shortcuts')}</h3>
          <div className="shortcut-grid">
            {SHORTCUTS.map(([key, value]) => (
              <div key={key} className="shortcut-row">
                <span>{t(key)}</span>
                <kbd>{value}</kbd>
              </div>
            ))}
          </div>
        </div>
        <div className="help-footer">
          <button type="button" className="link-btn" onClick={() => void window.api.openExternal('https://studio-neutrino.com/')}>
            <ExternalLink size={13} /> {t('help.shortcut.docs')}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => void window.api.openExternal('https://studio-neutrino.com/articles/neutrino-cli-musicxml/')}
          >
            <BookOpen size={13} /> MusicXML guide
          </button>
        </div>
        <div className="help-license">
          <strong>{t('help.license')}</strong>
          <p>{t('help.licenseBody')}</p>
          <span>{t('help.builtWith')}</span>
        </div>
      </div>
    </Modal>
  );
}
