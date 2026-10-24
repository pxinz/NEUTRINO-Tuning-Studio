import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Clipboard, FileText, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import { IconButton } from './ui';

export default function LogDrawer() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.logOpen);
  const logs = useAppStore((s) => s.render.logs);
  const render = useAppStore((s) => s.render);
  const toggleLog = useAppStore((s) => s.toggleLog);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const pushToast = useAppStore((s) => s.pushToast);
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll, open]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      pushToast('success', t('notifications.copied'));
    } catch {}
  };

  return (
    <section className="log-drawer">
      <header className="log-header">
        <div className="log-title">
          <FileText size={15} />
          <strong>{t('log.title')}</strong>
          <span className={clsx('log-status', render.status)}>
            {render.status === 'running'
              ? `${render.percent}% · ${render.stage ? t(`render.stage.${render.stage}`, { defaultValue: render.stage }) : t('render.progress')}`
              : render.status === 'error'
                ? t('render.failed')
                : render.status === 'done'
                  ? t('render.success')
                  : t('render.idle')}
          </span>
        </div>
        <div className="log-actions">
          <label className="log-check">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            {t('log.autoScroll')}
          </label>
          <IconButton icon={<Clipboard size={14} />} label={t('log.copy')} onClick={copy} />
          <IconButton icon={<Trash2 size={14} />} label={t('log.clear')} onClick={clearLogs} />
          {render.result?.logPath ? (
            <IconButton
              icon={<FileText size={14} />}
              label={t('log.openFile')}
              onClick={() => void window.api.showItemInFolder(render.result!.logPath)}
            />
          ) : null}
          <IconButton icon={<X size={15} />} label={t('common.close')} onClick={toggleLog} />
        </div>
      </header>
      <div className="log-body" ref={bodyRef}>
        {logs.length ? (
          logs.map((line, i) => (
            <div
              key={i}
              className={clsx(
                'log-line',
                /error|failed|exception/i.test(line) && 'error',
                /warning/i.test(line) && 'warning',
                /\[studio\]/.test(line) && 'studio',
                /progress\s*=/i.test(line) && 'progress',
              )}
            >
              <span className="log-index">{String(i + 1).padStart(3, '0')}</span>
              <span>{line}</span>
            </div>
          ))
        ) : (
          <div className="log-empty">{t('log.empty')}</div>
        )}
      </div>
    </section>
  );
}
