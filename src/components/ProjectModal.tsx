import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button, Field, NumberField } from './ui';
import { formatTime } from '../lib/time';
import { getPhrases, scoreDurationSeconds } from '../lib/score';

export default function ProjectModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'project');
  const setModal = useAppStore((s) => s.setModal);
  const project = useAppStore((s) => s.project);
  const projectPath = useAppStore((s) => s.projectPath);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const setProjectMeta = useAppStore((s) => s.setProjectMeta);
  const saveProject = useAppStore((s) => s.saveProject);
  const [name, setName] = useState(project.name);
  const [title, setTitle] = useState(project.score.title);
  const [artist, setArtist] = useState(project.score.artist);
  const [bpm, setBpm] = useState(project.score.tempos[0]?.bpm || 100);
  const [num, setNum] = useState(project.score.timeSigs[0]?.numerator || 4);
  const [den, setDen] = useState(project.score.timeSigs[0]?.denominator || 4);

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setTitle(project.score.title);
    setArtist(project.score.artist);
    setBpm(project.score.tempos[0]?.bpm || 100);
    setNum(project.score.timeSigs[0]?.numerator || 4);
    setDen(project.score.timeSigs[0]?.denominator || 4);
  }, [open, project.id]);

  if (!open) return null;

  const phrases = getPhrases(project.score);
  const duration = scoreDurationSeconds(project.score);

  const apply = () => {
    if (name.trim() !== project.name) setProjectName(name);
    setProjectMeta({
      title,
      artist,
      bpm,
      numerator: num,
      denominator: den,
    });
    setModal(null);
  };

  return (
    <Modal
      open={open}
      title={t('project.detailsTitle')}
      onClose={() => setModal(null)}
      width={660}
      footer={
        <>
          <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={apply}>{t('common.apply')}</Button>
        </>
      }
    >
      <div className="project-modal">
        <div className="project-modal-stats">
          <div><span>{t('project.notes')}</span><strong>{project.score.notes.length}</strong></div>
          <div><span>{t('project.phrases')}</span><strong>{phrases.length}</strong></div>
          <div><span>{t('project.length')}</span><strong>{formatTime(duration, false)}</strong></div>
        </div>
        <Field label={t('project.name')}>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="settings-grid-2">
          <Field label={t('project.title')}>
            <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('project.artist')}>
            <input className="text-input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </Field>
        </div>
        <div className="dual-fields">
          <Field label={t('project.bpm')}>
            <NumberField value={bpm} min={20} max={400} step={1} onChange={setBpm} suffix="BPM" />
          </Field>
          <Field label={t('project.timeSignature')}>
            <div className="time-sig-input">
              <NumberField value={num} min={1} max={32} step={1} onChange={setNum} />
              <span>/</span>
              <select className="select" value={den} onChange={(e) => setDen(Number(e.target.value))}>
                {[2, 4, 8, 16].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </Field>
        </div>
        <div className="project-path-row" title={projectPath || ''}>
          <span>{projectPath || t('topbar.untitled')}</span>
        </div>
        <div className="project-modal-actions">
          <Button variant="secondary" onClick={() => void saveProject()}>
            <Save size={14} /> {t('project.save')}
          </Button>
          <Button variant="ghost" onClick={() => void saveProject(true)}>{t('common.saveAs')}</Button>
        </div>
        <p className="settings-note">{t('timing.renderHint')}</p>
      </div>
    </Modal>
  );
}
