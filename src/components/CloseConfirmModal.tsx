import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, TriangleAlert } from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button } from './ui';

export default function CloseConfirmModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'close');
  const setModal = useAppStore((s) => s.setModal);
  const saveProject = useAppStore((s) => s.saveProject);
  const project = useAppStore((s) => s.project);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const saveAndClose = async () => {
    setSaving(true);
    try {
      const ok = await saveProject();
      if (ok) await window.api.confirmClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('close.title')}
      onClose={() => setModal(null)}
      width={470}
      footer={
        <>
          <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              setModal(null);
              void window.api.confirmClose();
            }}
          >
            {t('close.discard')}
          </Button>
          <Button variant="primary" onClick={() => void saveAndClose()} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t('close.saveAndClose')}
          </Button>
        </>
      }
    >
      <div className="close-confirm">
        <div className="close-confirm-icon">
          <TriangleAlert size={22} />
        </div>
        <div>
          <strong>{t('close.message', { name: project.name })}</strong>
          <p>{t('close.detail')}</p>
        </div>
      </div>
    </Modal>
  );
}
