import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button } from './ui';

export default function AboutModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'about');
  const setModal = useAppStore((s) => s.setModal);
  const appInfo = useAppStore((s) => s.appInfo);
  const neutrino = useAppStore((s) => s.neutrino);
  return (
    <Modal
      open={open}
      title={t('about.title')}
      onClose={() => setModal(null)}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => void window.api.openExternal('https://studio-neutrino.com/')}>
            <ExternalLink size={14} /> studio-neutrino.com
          </Button>
          <Button variant="primary" onClick={() => setModal(null)}>{t('common.close')}</Button>
        </>
      }
    >
      <div className="about-body">
        <div className="about-logo about-logo-text">
          <div>
            <strong>NEUTRINO Tuning Studio</strong>
            <span>{t('about.version', { version: appInfo?.version || '1.0.0' })}</span>
          </div>
        </div>
        <p>{t('about.description')}</p>
        <div className="about-meta">
          <div><span>Electron</span><strong>{appInfo?.electron || '—'}</strong></div>
          <div><span>Chromium</span><strong>{appInfo?.chrome || '—'}</strong></div>
          <div><span>{t('about.neutrino')}</span><strong>{neutrino?.version || '—'}</strong></div>
          <div><span>Platform</span><strong>{appInfo?.platform} / {appInfo?.arch}</strong></div>
        </div>
        <p className="about-disclaimer">{t('about.disclaimer')}</p>
        <span className="about-license">{t('about.license')}</span>
      </div>
    </Modal>
  );
}
