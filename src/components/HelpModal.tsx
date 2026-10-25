import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ExternalLink, Keyboard, Sparkles } from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button } from './ui';
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_DEFAULTS,
  formatShortcut,
  labelKeyFor,
} from '../lib/shortcuts';

export default function HelpModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'help');
  const setModal = useAppStore((s) => s.setModal);
  const settings = useAppStore((s) => s.settings);
  const appInfo = useAppStore((s) => s.appInfo);
  const bindings = { ...SHORTCUT_DEFAULTS, ...(settings?.shortcuts || {}) };
  const isMac = appInfo?.platform === 'darwin';
  const shortcuts = SHORTCUT_ACTIONS.filter((action) => bindings[action]);

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
            {shortcuts.map((action) => (
              <div key={action} className="shortcut-row">
                <span>{t(labelKeyFor(action))}</span>
                <kbd>{formatShortcut(bindings[action], isMac)}</kbd>
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
