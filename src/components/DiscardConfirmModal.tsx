import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, TriangleAlert } from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button } from './ui';

export default function DiscardConfirmModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'discard');
  const project = useAppStore((s) => s.project);
  const resolveDiscard = useAppStore((s) => s.resolveDiscard);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const run = async (choice: 'save' | 'discard' | 'cancel') => {
    setBusy(true);
    try {
      await resolveDiscard(choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('discard.title')}
      onClose={() => void run('cancel')}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={() => void run('cancel')} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void run('discard')} disabled={busy}>
            {t('discard.discard')}
          </Button>
          <Button variant="primary" onClick={() => void run('save')} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t('discard.save')}
          </Button>
        </>
      }
    >
      <div className="close-confirm">
        <div className="close-confirm-icon">
          <TriangleAlert size={22} />
        </div>
        <div>
          <strong>{t('discard.message', { name: project.name })}</strong>
          <p>{t('discard.detail')}</p>
        </div>
      </div>
    </Modal>
  );
}
