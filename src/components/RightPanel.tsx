import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertCircle,
  AudioLines,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  ExternalLink,
  FolderOpen,
  FileText,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  Music2,
  Play,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import {
  beatToSeconds,
  getPhrases,
  getScoreHash,
  scoreDurationSeconds,
} from '../lib/score';
import { formatTime, midiToName, clamp } from '../lib/time';
import { f0Stats } from '../lib/pitch';
import { renderSignature } from '../lib/project';
import { checkLyric } from '../lib/lyrics';
import { timingHash } from '../lib/timing';
import { Badge, Button, Card, Field, IconButton, NumberField, Slider, Toggle } from './ui';
import type { ModelInfo, Note } from '../lib/types';

function localizedModelName(m: ModelInfo | undefined, language: string) {
  if (!m) return '';
  const key = language === 'zh' ? 'zh' : language === 'ja' ? 'ja' : 'en';
  return m.localizedNames?.[key] || m.name || m.id;
}

function selectedNoteOf(notes: Note[], selection: string[]): Note | null {
  return notes.find((n) => selection.includes(n.id)) || null;
}

function NoteInspector() {
  const { t } = useTranslation();
  const score = useAppStore((s) => s.project.score);
  const selection = useAppStore((s) => s.selection);
  const updateNote = useAppStore((s) => s.updateNote);
  const deleteNotes = useAppStore((s) => s.deleteNotes);
  const duplicateSelection = useAppStore((s) => s.duplicateSelection);
  const note = selectedNoteOf(score.notes, selection);
  const [lyric, setLyric] = useState(note?.lyric || '');
  useEffect(() => {
    setLyric(note?.lyric || '');
  }, [note?.id, note?.lyric]);
  if (!note) {
    return <div className="rp-hint">{t('score.noSelection')}</div>;
  }
  const startSec = beatToSeconds(score, note.start);
  const endSec = beatToSeconds(score, note.start + note.duration);
  const check = checkLyric(note.lyric);
  const commitLyric = () => {
    if (lyric.trim() !== note.lyric) updateNote(note.id, { lyric: lyric.trim() }, 'edit-lyric');
  };
  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <span className="inspector-kicker">{t('score.inspector')}</span>
          <strong>{midiToName(note.pitch)}</strong>
        </div>
        <Badge tone={check.ok ? 'accent' : 'warning'}>{check.ok ? `${startSec.toFixed(2)}s` : t('errors.lyrics')}</Badge>
      </div>
      <div className="inspector-grid">
        <Field label={t('score.pitch')}>
          <NumberField
            value={note.pitch}
            min={0}
            max={127}
            onChange={(v) => updateNote(note.id, { pitch: clamp(Math.round(v), 0, 127) })}
          />
        </Field>
        <Field label={t('score.lyric')}>
          <input
            className={clsx('text-input', !check.ok && 'invalid')}
            value={lyric}
            onChange={(e) => setLyric(e.target.value)}
            onBlur={commitLyric}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setLyric(note.lyric);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={t('score.lyricPlaceholder')}
          />
        </Field>
        <Field label={t('score.start')} hint={`${startSec.toFixed(3)}s`}>
          <NumberField
            value={Math.round(note.start * 1000) / 1000}
            min={0}
            step={0.25}
            suffix={t('common.beats')}
            onChange={(v) => updateNote(note.id, { start: Math.max(0, v) })}
          />
        </Field>
        <Field label={t('score.length')} hint={`${(endSec - startSec).toFixed(3)}s`}>
          <NumberField
            value={Math.round(note.duration * 1000) / 1000}
            min={0.0625}
            step={0.25}
            suffix={t('common.beats')}
            onChange={(v) => updateNote(note.id, { duration: Math.max(0.0625, v) })}
          />
        </Field>
      </div>
      <div className="inspector-row">
        <Toggle
          checked={note.breath}
          onChange={(v) => updateNote(note.id, { breath: v }, 'toggle-breath')}
          label={t('score.breath')}
        />
        <div className="inspector-actions">
          <IconButton icon={<RefreshCw size={14} />} label={t('score.duplicate')} onClick={duplicateSelection} />
          <IconButton
            icon={<Trash2 size={14} />}
            label={t('score.deleteNote')}
            onClick={() => deleteNotes([note.id], 'delete-note')}
          />
        </div>
      </div>
      {!check.ok && check.warnings.length ? <div className="inline-warning">{check.warnings[0]}</div> : null}
    </div>
  );
}

function TimingInspector() {
  const { t } = useTranslation();
  const timing = useAppStore((s) => s.timing);
  const index = useAppStore((s) => s.selectedPhoneme);
  const phoneme = timing && index !== null ? timing.phonemes[index] : null;
  if (!phoneme) return <div className="rp-hint">{t('timing.dragHint')}</div>;
  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <span className="inspector-kicker">{t('timing.selected', { phoneme: phoneme.phoneme })}</span>
          <strong>{phoneme.phoneme}</strong>
        </div>
        <Badge tone="neutral">{(phoneme.end - phoneme.start).toFixed(3)}s</Badge>
      </div>
      <div className="inspector-metrics">
        <div>
          <span>{t('timing.start')}</span>
          <strong>{phoneme.start.toFixed(3)}s</strong>
        </div>
        <div>
          <span>{t('timing.end')}</span>
          <strong>{phoneme.end.toFixed(3)}s</strong>
        </div>
        <div>
          <span>{t('timing.duration')}</span>
          <strong>{(phoneme.end - phoneme.start).toFixed(3)}s</strong>
        </div>
      </div>
      <div className="rp-hint">{t('timing.hint')}</div>
    </div>
  );
}

function PitchInspector() {
  const { t } = useTranslation();
  const currentF0 = useAppStore((s) => s.currentF0);
  const baseF0 = useAppStore((s) => s.baseF0);
  const pitchEdited = useAppStore((s) => s.pitchEdited);
  const resetPitch = useAppStore((s) => s.resetPitch);
  const stats = f0Stats(currentF0);
  const baseStats = f0Stats(baseF0);
  if (!currentF0) return <div className="rp-hint">{t('pitch.noData')}</div>;
  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <span className="inspector-kicker">{t('pitch.title')}</span>
          <strong>{pitchEdited ? t('pitch.edited') : t('pitch.model')}</strong>
        </div>
        <Badge tone={pitchEdited ? 'warning' : 'accent'}>{t('pitch.frames', { count: currentF0.length })}</Badge>
      </div>
      <div className="inspector-metrics">
        <div>
          <span>{t('pitch.range')}</span>
          <strong>
            {stats.min.toFixed(0)}–{stats.max.toFixed(0)} Hz
          </strong>
        </div>
        <div>
          <span>{t('pitch.voiced')}</span>
          <strong>{((stats.voiced / Math.max(1, currentF0.length)) * 100).toFixed(0)}%</strong>
        </div>
        <div>
          <span>{t('pitch.modelLabel')}</span>
          <strong>
            {baseStats.min.toFixed(0)}–{baseStats.max.toFixed(0)} Hz
          </strong>
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={resetPitch} disabled={!pitchEdited}>
        <RefreshCw size={14} /> {t('pitch.resetAll')}
      </Button>
      <div className="rp-hint">{t('pitch.hint')}</div>
    </div>
  );
}

function DynamicsInspector() {
  const { t } = useTranslation();
  const dynamics = useAppStore((s) => s.project.dynamics);
  const setEnabled = useAppStore((s) => s.setDynamicsEnabled);
  const reset = useAppStore((s) => s.resetDynamics);
  const smooth = useAppStore((s) => s.smoothDynamicsEnvelope);
  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <span className="inspector-kicker">{t('dynamics.title')}</span>
          <strong>{dynamics.enabled ? t('common.on') : t('common.off')}</strong>
        </div>
        <Badge tone={dynamics.enabled ? 'accent' : 'neutral'}>{t('dynamics.points', { count: dynamics.points.length })}</Badge>
      </div>
      <div className="inspector-row">
        <Toggle checked={dynamics.enabled} onChange={setEnabled} label={t('dynamics.enable')} />
        <div className="inspector-actions">
          <IconButton icon={<SlidersHorizontal size={14} />} label={t('dynamics.smooth')} onClick={smooth} />
          <IconButton icon={<RefreshCw size={14} />} label={t('dynamics.reset')} onClick={reset} />
        </div>
      </div>
      <div className="rp-hint">{t('dynamics.hint')}</div>
    </div>
  );
}

export default function RightPanel() {
  const { t } = useTranslation();
  const tab = useAppStore((s) => s.tab);
  const project = useAppStore((s) => s.project);
  const models = useAppStore((s) => s.models);
  const language = useAppStore((s) => s.language);
  const settings = useAppStore((s) => s.settings);
  const exporting = useAppStore((s) => s.exporting);
  const neutrino = useAppStore((s) => s.neutrino);
  const audio = useAppStore((s) => s.audio);
  const render = useAppStore((s) => s.render);
  const timing = useAppStore((s) => s.timing);
  const timingEdited = useAppStore((s) => s.timingEdited);
  const pitchEdited = useAppStore((s) => s.pitchEdited);
  const setSynth = useAppStore((s) => s.setSynth);
  const setModal = useAppStore((s) => s.setModal);
  const renderVocal = useAppStore((s) => s.renderVocal);
  const cancelRender = useAppStore((s) => s.cancelRender);
  const setTab = useAppStore((s) => s.setTab);
  const loadReferenceDialog = useAppStore((s) => s.loadReferenceDialog);
  const removeReference = useAppStore((s) => s.removeReference);
  const setReference = useAppStore((s) => s.setReference);
  const exportVocalWav = useAppStore((s) => s.exportVocalWav);
  const exportMixdown = useAppStore((s) => s.exportMixdown);
  const toggleLog = useAppStore((s) => s.toggleLog);
  const saveProject = useAppStore((s) => s.saveProject);
  const openExternal = (url: string) => void window.api.openExternal(url);

  const model = models.find((m) => m.id === project.synth.model);
  const supportModels = models.filter((m) => m.id !== project.synth.model && m.support);
  const supportModel = models.find((m) => m.id === project.synth.supportModel);
  const phrases = getPhrases(project.score);
  const duration = scoreDurationSeconds(project.score);
  const scoreHash = getScoreHash(project.score);
  const synthSig = renderSignature(project.synth);
  const rendered = project.render;
  const stale =
    !rendered || rendered.scoreHash !== scoreHash || (rendered.synthHash && rendered.synthHash !== synthSig);
  const timingStale = Boolean(
    timing && (!rendered || rendered.timingHash !== timingHash(timing.text)),
  );
  const plannedMode = stale ? 'full' : timingStale ? 'timing' : pitchEdited ? 'vocode' : 'full';
  const mode = render.status === 'running' || render.status === 'done' ? render.mode || plannedMode : plannedMode;
  const modeKey =
    mode === 'full' ? 'full' : mode === 'timing' ? 'timing' : mode === 'phrase' ? 'phrase' : 'pitch';
  const busy = render.status === 'running';
  const elapsed = render.elapsedMs ? `${(render.elapsedMs / 1000).toFixed(1)}s` : '';
  const stageLabel = render.stage ? t(`render.stage.${render.stage}`, { defaultValue: render.stage }) : '';

  return (
    <aside className="right-panel">
      <div className="rp-scroll">
        <Card title={t('analysis.title')} collapsible defaultOpen>
          <div className="inspector-context">
            {tab === 'score' ? <NoteInspector /> : null}
            {tab === 'timing' ? <TimingInspector /> : null}
            {tab === 'pitch' ? <PitchInspector /> : null}
            {tab === 'dynamics' ? <DynamicsInspector /> : null}
          </div>
          <div className="analysis-row">
            <div>
              <span>{t('project.notes')}</span>
              <strong>{project.score.notes.length}</strong>
            </div>
            <div>
              <span>{t('project.phrases')}</span>
              <strong>{phrases.length}</strong>
            </div>
            <div>
              <span>{t('project.length')}</span>
              <strong>{formatTime(duration, false)}</strong>
            </div>
          </div>
        </Card>

        <Card
          title={
            <span className="card-title-with-icon">
              <AudioLines size={15} /> {t('voice.title')}
            </span>
          }
          actions={<Badge tone={neutrino?.ok ? 'success' : 'danger'}>{neutrino?.ok ? t('common.ready') : t('common.error')}</Badge>}
          collapsible
          defaultOpen
        >
          <Field label={t('voice.model')} hint={model ? `${model.localizedNames?.[language === 'zh' ? 'zh' : language === 'ja' ? 'ja' : 'en'] || model.name} · ${model.version?.startsWith('v') ? model.version : `v${model.version}`}` : undefined}>
            <select
              className="select"
              value={project.synth.model}
              onChange={(e) => setSynth({ model: e.target.value, supportModel: '' })}
              disabled={!models.length}
            >
              {!models.length ? <option value="">{t('voice.noModels')}</option> : null}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {localizedModelName(m, language)} · {m.id}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('voice.support')} hint={t('voice.supportHint')}>
            <select
              className="select"
              value={project.synth.supportModel}
              onChange={(e) => setSynth({ supportModel: e.target.value })}
              disabled={!supportModels.length}
            >
              <option value="">{t('voice.supportNone')}</option>
              {supportModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {localizedModelName(m, language)}
                </option>
              ))}
            </select>
          </Field>

          <div className="dual-slider">
            <Field label={`${t('voice.styleShift')}  ${project.synth.styleShift > 0 ? '+' : ''}${project.synth.styleShift}`}>
              <Slider
                min={-12}
                max={12}
                step={1}
                value={project.synth.styleShift}
                onChange={(v) => setSynth({ styleShift: v })}
                ariaLabel={t('voice.styleShift')}
              />
            </Field>
            <Field label={`${t('voice.transpose')}  ${project.synth.transpose > 0 ? '+' : ''}${project.synth.transpose}`}>
              <Slider
                min={-12}
                max={12}
                step={1}
                value={project.synth.transpose}
                onChange={(v) => setSynth({ transpose: v })}
                ariaLabel={t('voice.transpose')}
              />
            </Field>
          </div>

          {model ? (
            <div className="model-info">
              <div>
                <span>{t('voice.range')}</span>
                <strong>
                  {model.bottomKey !== null && model.topKey !== null
                    ? `${midiToName(model.bottomKey)} – ${midiToName(model.topKey)}`
                    : '—'}
                </strong>
              </div>
              <div>
                <span>{t('voice.modelInfo', { type: model.type, gender: model.gender, language: model.language })}</span>
              </div>
              <div className="model-info-actions">
                {model.licensePath ? (
                  <button type="button" className="link-btn" onClick={() => void window.api.showItemInFolder(model.licensePath!)}>
                    <FileText size={12} /> {t('voice.license')}
                  </button>
                ) : null}
                {model.readmePath ? (
                  <button type="button" className="link-btn" onClick={() => void window.api.showItemInFolder(model.readmePath!)}>
                    <Info size={12} /> {t('voice.readme')}
                  </button>
                ) : null}
                <button type="button" className="link-btn" onClick={() => void window.api.showItemInFolder(model.dir)}>
                  <FolderOpen size={12} /> {t('voice.openFolder')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="toggles-row">
            <Toggle checked={project.synth.useGpu} onChange={(v) => setSynth({ useGpu: v })} label={t('voice.gpu')} />
          </div>
          <div className="dual-fields">
            <Field label={t('voice.threads')}>
              <NumberField value={project.synth.threads} min={1} max={64} onChange={(v) => setSynth({ threads: Math.round(v) })} />
            </Field>
            <Field label={t('voice.sampleRate')}>
              <select className="select" value={project.synth.sampleRate} onChange={(e) => setSynth({ sampleRate: Number(e.target.value) })}>
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48 kHz</option>
                <option value={32000}>32 kHz</option>
              </select>
            </Field>
            <Field label={t('voice.bitDepth')}>
              <select className="select" value={project.synth.bitDepth} onChange={(e) => setSynth({ bitDepth: Number(e.target.value) })}>
                <option value={16}>16 bit</option>
                <option value={24}>24 bit</option>
                <option value={32}>32 bit float</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card
          title={
            <span className="card-title-with-icon">
              <Sparkles size={15} /> {t('render.title')}
            </span>
          }
          actions={<Badge tone={busy ? 'info' : render.status === 'error' ? 'danger' : render.status === 'done' ? 'success' : 'neutral'}>{busy ? `${render.percent}%` : t(`render.stage.${render.status === 'done' ? 'done' : 'idle'}`, { defaultValue: t('render.idle') })}</Badge>}
          defaultOpen
        >
          <div className="render-mode-row">
            <span className="render-mode-label">
              {t('render.title')} · <strong>{t(`render.${modeKey}`)}</strong>
            </span>
            {rendered ? <span className="render-timestamp">{new Date(rendered.renderedAt).toLocaleTimeString()}</span> : null}
          </div>
          {busy ? (
            <>
              <div className="progress-bar">
                <span style={{ width: `${render.percent}%` }} />
              </div>
              <div className="render-stage">
                <Loader2 size={14} className="spin" />
                <span>{stageLabel || t('render.progress')}</span>
                <span className="render-stage-detail">{render.detail}</span>
              </div>
              <Button variant="danger" size="md" className="full-width" onClick={() => void cancelRender()}>
                <Square size={14} /> {t('render.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                className="full-width render-primary"
                onClick={() => void renderVocal()}
                disabled={!neutrino?.ok || !project.score.notes.length}
              >
                <Sparkles size={16} /> {rendered ? t('render.rerender') : t('render.button')}
              </Button>
              <div className="render-hint">
                {mode === 'full'
                  ? t('render.takes')
                  : mode === 'timing'
                    ? t('timing.renderHint')
                    : mode === 'phrase'
                      ? t('render.phraseHint')
                      : t('pitch.renderHint')}
              </div>
            </>
          )}

          {render.error ? (
            <div className="inline-error">
              <AlertCircle size={14} />
              <span>{render.error}</span>
            </div>
          ) : null}

          {rendered && audio.loaded ? (
            <div className="render-result">
              <div className="render-result-head">
                <CheckCircle2 size={14} />
                <span>{formatTime(audio.duration)}</span>
                <span>{rendered.sampleRate} Hz · {rendered.bitsPerSample} bit</span>
              </div>
              <div className="render-result-actions">
                <Button size="sm" variant="secondary" onClick={() => void exportVocalWav()} disabled={exporting}>
                  <Download size={13} /> WAV
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void exportMixdown()} disabled={exporting}>
                  <Download size={13} /> {t('render.mixShort')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void window.api.showItemInFolder(rendered.wavPath)}>
                  <FolderOpen size={13} />
                </Button>
                <Button size="sm" variant="ghost" onClick={toggleLog}>
                  {t('render.logShort')}
                </Button>
              </div>
              {elapsed ? <div className="render-elapsed">{t('render.elapsed')} {elapsed}</div> : null}
            </div>
          ) : null}
        </Card>

        <Card
          title={
            <span className="card-title-with-icon">
              <Music2 size={15} /> {t('project.summary')}
            </span>
          }
          actions={<Button size="sm" variant="ghost" onClick={() => setModal('project')}><Settings2 size={13} /> {t('common.edit')}</Button>}
          collapsible
          defaultOpen={false}
        >
          <div className="project-summary">
            <div><span>{t('project.title')}</span><strong>{project.score.title || project.name}</strong></div>
            <div><span>{t('project.artist')}</span><strong>{project.score.artist || '—'}</strong></div>
            <div><span>{t('project.bpm')}</span><strong>{project.score.tempos[0]?.bpm || 100} BPM</strong></div>
            <div><span>{t('project.timeSignature')}</span><strong>{project.score.timeSigs[0]?.numerator || 4}/{project.score.timeSigs[0]?.denominator || 4}</strong></div>
          </div>
          <div className="project-actions">
            <Button size="sm" variant="secondary" onClick={() => void saveProject()}>
              <Save size={13} /> {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModal('project')}>
              <ChevronRight size={13} /> {t('project.editDetails')}
            </Button>
          </div>
        </Card>

        <Card title={t('reference.title')} collapsible defaultOpen={false}>
          {project.reference ? (
            <>
              <div className="reference-name">
                <AudioLines size={14} />
                <span title={project.reference.path}>{project.reference.name || project.reference.path}</span>
                <IconButton icon={<Trash2 size={13} />} label={t('reference.remove')} onClick={removeReference} />
              </div>
              <div className="reference-controls">
                <Field label={t('reference.offset')}>
                  <NumberField
                    value={project.reference.offset}
                    min={-3600}
                    step={0.1}
                    suffix="s"
                    onChange={(v) => setReference({ offset: v })}
                  />
                </Field>
                <Field label={`${t('reference.volume')} ${Math.round(project.reference.volume * 100)}%`}>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={project.reference.volume}
                    onChange={(v) => setReference({ volume: v })}
                    ariaLabel={t('reference.volume')}
                  />
                </Field>
              </div>
              <div className="toggles-row">
                <Toggle checked={!project.reference.muted} onChange={(v) => setReference({ muted: !v })} label={t('reference.mute')} />
              </div>
            </>
          ) : (
            <div className="reference-empty">
              <span>{t('project.noReference')}</span>
              <Button size="sm" variant="secondary" onClick={() => void loadReferenceDialog()}>
                <Upload size={13} /> {t('reference.load')}
              </Button>
            </div>
          )}
          <div className="rp-hint">{t('reference.hint')}</div>
        </Card>
      </div>
    </aside>
  );
}


