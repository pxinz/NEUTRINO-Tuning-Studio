import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Languages, ListMusic, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button, Field } from './ui';
import { beatToSeconds } from '../lib/score';
import { checkLyric, KANA_ROWS, romajiToKana } from '../lib/lyrics';
import { midiToName } from '../lib/time';

export default function LyricsModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'lyrics');
  const setModal = useAppStore((s) => s.setModal);
  const score = useAppStore((s) => s.project.score);
  const setLyrics = useAppStore((s) => s.setLyrics);
  const pushToast = useAppStore((s) => s.pushToast);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [romaji, setRomaji] = useState('');
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!open) return;
    const map: Record<string, string> = {};
    for (const note of score.notes) map[note.id] = note.lyric;
    setValues(map);
    setActiveId(score.notes[0]?.id || null);
    setRomaji('');
  }, [open, score.notes]);

  const badCount = useMemo(
    () => score.notes.filter((n) => !checkLyric(values[n.id] ?? n.lyric).ok).length,
    [score.notes, values],
  );

  if (!open) return null;

  const setActiveValue = (value: string) => {
    if (!activeId) return;
    setValues((v) => ({ ...v, [activeId]: value }));
  };

  const insert = (text: string) => {
    if (!activeId) return;
    const current = values[activeId] ?? '';
    setActiveValue((current + text).slice(0, 24));
    inputs.current[activeId]?.focus();
  };

  const convertRomaji = () => {
    if (!romaji.trim()) return;
    const kana = romajiToKana(romaji);
    if (!kana) return;
    insert(kana);
    setRomaji('');
  };

  const fillEmpty = () => {
    setValues((v) => {
      const next = { ...v };
      for (const note of score.notes) if (!(next[note.id] || '').trim()) next[note.id] = 'ら';
      return next;
    });
  };

  const apply = () => {
    setLyrics(values, 'lyrics-edit');
    if (badCount) pushToast('warning', t('notifications.lyricsInvalid'));
    else pushToast('success', t('notifications.lyricsApplied'));
    setModal(null);
  };

  return (
    <Modal
      open={open}
      title={t('score.lyricsTitle')}
      onClose={() => setModal(null)}
      width={800}
      footer={
        <>
          <span className={clsx('lyrics-summary', badCount && 'warning')}>
            {badCount ? <AlertCircle size={13} /> : <Check size={13} />}
            {badCount ? t('score.unsupportedLyrics', { count: badCount }) : t('analysis.ok')}
          </span>
          <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={apply}>{t('score.applyLyrics')}</Button>
        </>
      }
    >
      <div className="lyrics-modal">
        <div className="lyrics-hint">
          <ListMusic size={15} />
          <span>{t('score.lyricsHint')}</span>
        </div>

        <div className="lyrics-tools">
          <div className="romaji-convert">
            <input
              className="text-input"
              value={romaji}
              onChange={(e) => setRomaji(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') convertRomaji();
              }}
              placeholder={t('score.romajiPlaceholder')}
            />
            <Button size="sm" variant="secondary" onClick={convertRomaji} disabled={!romaji.trim()}>
              <Wand2 size={14} /> {t('score.romajiApply')}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={fillEmpty}>
            <Languages size={14} /> ら
          </Button>
        </div>

        <div className="kana-palette">
          {KANA_ROWS.map((row, i) => (
            <div key={i} className="kana-row">
              {row.map((kana) => (
                <button key={kana} type="button" onClick={() => insert(kana)}>
                  {kana}
                </button>
              ))}
            </div>
          ))}
        </div>

        {!score.notes.length ? (
          <div className="rp-hint">{t('score.noNotes')}</div>
        ) : (
          <div className="lyrics-list">
            {score.notes.map((note, i) => {
              const value = values[note.id] ?? '';
              const check = checkLyric(value);
              const time = beatToSeconds(score, note.start);
              return (
                <div
                  key={note.id}
                  className={clsx('lyrics-row', activeId === note.id && 'active', !check.ok && 'invalid')}
                  onClick={() => setActiveId(note.id)}
                >
                  <span className="lyrics-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="lyrics-time">{time.toFixed(2)}s</span>
                  <span className="lyrics-pitch">{midiToName(note.pitch)}</span>
                  <input
                    ref={(el) => {
                      inputs.current[note.id] = el;
                    }}
                    value={value}
                    onFocus={() => setActiveId(note.id)}
                    onChange={(e) => setValues((v) => ({ ...v, [note.id]: e.target.value }))}
                    placeholder={t('score.lyricPlaceholder')}
                    maxLength={24}
                  />
                  <span className={clsx('lyrics-status', check.ok ? 'ok' : 'bad')}>
                    {check.ok ? <Check size={12} /> : check.warnings[0] || '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
