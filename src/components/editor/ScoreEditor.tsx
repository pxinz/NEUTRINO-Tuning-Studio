import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Eraser,
  GripVertical,
  ListMusic,
  MousePointer2,
  Music2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Wind,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../state/useAppStore';
import { useElementSize } from '../../hooks/useElementSize';
import { useTimeline } from '../../hooks/useTimeline';
import {
  beatToSeconds,
  getPhrases,
  overlappingNotes,
  scoreDurationSeconds,
  secondsToBeat,
} from '../../lib/score';
import { checkLyric } from '../../lib/lyrics';
import { clamp, midiToName, uid } from '../../lib/time';
import { drawTimelineGrid, fitCanvas, cssVar } from '../../lib/canvas';
import { computePitchLayout, PITCH_ROW_HEIGHT } from '../../lib/pitchLayout';
import TimelineRuler from '../timeline/TimelineRuler';
import WaveformStrip from '../timeline/WaveformStrip';
import ZoomBar from '../timeline/ZoomBar';
import PitchScrollbar from '../timeline/PitchScrollbar';
import Playhead from '../timeline/Playhead';
import PianoKeyboard from './PianoKeyboard';
import { Button, IconButton } from '../ui';
import type { Note } from '../../lib/types';

interface DragState {
  mode: 'move' | 'resize';
  anchorId: string;
  startX: number;
  startY: number;
  originals: Note[];
  preview: Note[];
}

interface Marquee {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const SNAP_OPTIONS = [
  { value: 1, label: '1/4' },
  { value: 0.5, label: '1/8' },
  { value: 0.25, label: '1/16' },
  { value: 0.125, label: '1/32' },
  { value: 0, label: 'off' },
];

export default function ScoreEditor() {
  const { t } = useTranslation();
  const score = useAppStore((s) => s.project.score);
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const selection = useAppStore((s) => s.selection);
  const selectNotes = useAppStore((s) => s.selectNotes);
  const toggleSelection = useAppStore((s) => s.toggleSelection);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setScore = useAppStore((s) => s.setScore);
  const updateNote = useAppStore((s) => s.updateNote);
  const addNote = useAppStore((s) => s.addNote);
  const deleteNotes = useAppStore((s) => s.deleteNotes);
  const duplicateSelection = useAppStore((s) => s.duplicateSelection);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const viewport = useAppStore((s) => s.viewport);
  const loop = useAppStore((s) => s.transport.loop);
  const loopStart = useAppStore((s) => s.transport.loopStart);
  const loopEnd = useAppStore((s) => s.transport.loopEnd);
  const theme = useAppStore((s) => s.theme);
  const setModal = useAppStore((s) => s.setModal);
  const importMusicXmlDialog = useAppStore((s) => s.importMusicXmlDialog);
  const projectId = useAppStore((s) => s.project.id);
  const fitTimeline = useAppStore((s) => s.fitTimeline);

  const { ref: rootRef, size: rootSize } = useElementSize<HTMLDivElement>();
  const { ref: bodyRef, size: bodySize } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const timelineWidth = Math.max(0, bodySize.width - 58);
  const gridHeight = Math.max(80, bodySize.height - 30 - 60);
  const timeline = useTimeline(timelineWidth, { verticalHeight: gridHeight });
  const pxPerSec = timeline.pxPerSec;
  const scrollSec = timeline.scrollSec;
  const pitchTop = viewport.pitchTop;
  const pitchBottom = viewport.pitchBottom;
  const pitchLayout = computePitchLayout(pitchTop, pitchBottom, gridHeight, timeline.pitchScroll);
  const rowHeight = pitchLayout.rowHeight;
  const rowOffset = pitchLayout.rowOffset;

  const [snapBeats, setSnapBeats] = useState(0.25);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  const marqueeStart = useRef<Marquee | null>(null);
  const [lyricEdit, setLyricEdit] = useState<{ id: string; x: number; y: number; value: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [createDraft, setCreateDraft] = useState<Note | null>(null);
  const createDraftRef = useRef<Note | null>(null);
  const createRef = useRef<{ startX: number; base: Note } | null>(null);
  const eraseRef = useRef<{ ids: Set<string>; history: boolean } | null>(null);
  const fittedProject = useRef<string | null>(null);

  useEffect(() => {
    if (timelineWidth > 80 && gridHeight > 200 && fittedProject.current !== projectId) {
      fittedProject.current = projectId;
      fitTimeline(timelineWidth);
      const contentHeight = Math.max(1, pitchTop - pitchBottom + 1) * PITCH_ROW_HEIGHT;
      if (contentHeight > gridHeight) {
        timeline.setViewport({ pitchScroll: (contentHeight - gridHeight) / 2 });
      }
    }
  }, [projectId, timelineWidth, gridHeight, pitchTop, pitchBottom, fitTimeline, timeline]);

  const snap = useCallback(
    (beats: number) => {
      if (!snapBeats) return Math.round(beats * 64) / 64;
      return Math.round(beats / snapBeats) * snapBeats;
    },
    [snapBeats],
  );

  const previewMap = new Map<string, Note>();
  for (const n of drag?.preview || []) previewMap.set(n.id, n);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !timelineWidth || !gridHeight) return;
    const ctx = fitCanvas(canvas, timelineWidth, gridHeight);
    if (!ctx) return;
    drawTimelineGrid(ctx, {
      score,
      pxPerSec,
      scrollSec,
      width: timelineWidth,
      height: gridHeight,
      pitchTop,
      pitchBottom,
      rowHeight,
      rowOffset,
      showRows: true,
    });
    if (loop) {
      const x1 = (Math.max(loopStart, scrollSec) - scrollSec) * pxPerSec;
      const x2 = (Math.min(loopEnd || 0, scrollSec + timelineWidth / pxPerSec) - scrollSec) * pxPerSec;
      if (x2 > x1) {
        ctx.fillStyle = cssVar('--accent-soft', 'rgba(94,234,212,0.08)');
        ctx.fillRect(x1, 0, x2 - x1, gridHeight);
      }
    }
  }, [
    timelineWidth,
    gridHeight,
    score,
    pxPerSec,
    scrollSec,
    pitchTop,
    pitchBottom,
    rowHeight,
    rowOffset,
    loop,
    loopStart,
    loopEnd,
    theme,
  ]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return timeline.attachWheel(el);
  }, [bodyRef, timeline.attachWheel]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const gridX = (time: number) => (time - scrollSec) * pxPerSec;
  const timeAtX = (x: number) => scrollSec + x / pxPerSec;
  const beatAtX = (x: number) => secondsToBeat(score, timeAtX(x));
  const pitchAtY = (y: number) => clamp(Math.round(pitchTop - (y - rowOffset) / rowHeight), 0, 127);
  const yForPitch = (pitch: number) => rowOffset + (pitchTop - pitch) * rowHeight;

  const beginErase = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const state = { ids: new Set<string>(), history: false };
    eraseRef.current = state;
    const eraseAt = (clientX: number, clientY: number) => {
      for (const el of document.elementsFromPoint(clientX, clientY)) {
        const noteEl = (el as HTMLElement).closest?.('[data-note-id]') as HTMLElement | null;
        const id = noteEl?.dataset.noteId;
        if (!id || state.ids.has(id)) continue;
        state.ids.add(id);
        if (!state.history) {
          pushHistory('erase-notes');
          state.history = true;
        }
        deleteNotes([id]);
      }
    };
    eraseAt(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => {
      if ((ev.buttons & 1) === 0) return;
      eraseAt(ev.clientX, ev.clientY);
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      eraseRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  };

  const startNoteDrag = (e: React.PointerEvent, note: Note) => {
    e.stopPropagation();
    if (tool === 'eraser') {
      beginErase(e);
      return;
    }
    if (e.button === 2) return;
    if (e.shiftKey) {
      toggleSelection(note.id);
      return;
    }
    let ids = selection;
    if (!selection.includes(note.id)) {
      ids = [note.id];
      selectNotes(ids);
    }
    const anchor = note;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nearEdge = rect.right - e.clientX < 9;
    const mode: 'move' | 'resize' = nearEdge && ids.length === 1 ? 'resize' : 'move';
    const originals = score.notes.filter((n) => ids.includes(n.id)).map((n) => ({ ...n }));
    if (mode === 'resize') {
      const only = originals.find((n) => n.id === note.id);
      setDrag({
        mode,
        anchorId: note.id,
        startX: e.clientX,
        startY: e.clientY,
        originals: only ? [only] : [],
        preview: only ? [{ ...only }] : [],
      });
    } else {
      setDrag({ mode, anchorId: anchor.id, startX: e.clientX, startY: e.clientY, originals, preview: originals.map((n) => ({ ...n })) });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const deltaSec = dx / pxPerSec;
    const anchorOrigin = d.originals.find((n) => n.id === d.anchorId) || d.originals[0];
    if (!anchorOrigin) return;
    const anchorStartSec = beatToSeconds(score, anchorOrigin.start);
    const targetBeat = secondsToBeat(score, Math.max(0, anchorStartSec + deltaSec));
    const deltaBeats = targetBeat - anchorOrigin.start;
    const deltaPitch = -Math.round(dy / rowHeight);
    const preview = d.originals.map((n) => {
      if (d.mode === 'resize') {
        const raw = Math.max(snapBeats || 0.0625, n.duration + deltaBeats);
        return { ...n, duration: Math.max(snapBeats || 0.0625, snap(raw)) };
      }
      return {
        ...n,
        start: Math.max(0, snap(n.start + deltaBeats)),
        pitch: clamp(n.pitch + deltaPitch, 0, 127),
      };
    });
    setDrag({ ...d, preview });
  };

  const endNoteDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const changed = d.preview.some((n) => {
      const o = d.originals.find((x) => x.id === n.id);
      return o && (o.start !== n.start || o.duration !== n.duration || o.pitch !== n.pitch);
    });
    if (changed) {
      const map = new Map(d.preview.map((n) => [n.id, n]));
      const notes = score.notes.map((n) => map.get(n.id) || n);
      setScore({ ...score, notes }, d.mode === 'move' ? 'move-note' : 'resize-note');
    }
    setDrag(null);
  };

  const onSurfaceDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setContextMenu(null);
    if (lyricEdit) setLyricEdit(null);
    const rect = surfaceRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (tool === 'pencil') {
      const beat = Math.max(0, snap(beatAtX(x)));
      const duration = snapBeats || 1;
      const lastLyric = score.notes.length ? score.notes[score.notes.length - 1].lyric : 'ら';
      const base: Note = {
        id: uid(),
        start: beat,
        duration: Math.max(0.0625, duration),
        pitch: pitchAtY(y),
        lyric: lastLyric || 'ら',
        breath: false,
      };
      createRef.current = { startX: x, base };
      createDraftRef.current = base;
      setCreateDraft(base);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'eraser') {
      beginErase(e);
      return;
    }
    if (e.shiftKey) return;
    clearSelection();
    const start: Marquee = { x1: x, y1: y, x2: x, y2: y };
    marqueeStart.current = start;
    setMarquee(start);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSurfaceMove = (e: React.PointerEvent) => {
    if (createRef.current) {
      const rect = surfaceRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const endBeat = snap(secondsToBeat(score, timeAtX(x)));
      setCreateDraft((draft) => {
        if (!draft) return draft;
        const next = {
          ...draft,
          duration: Math.max(0.0625, endBeat - draft.start),
        };
        createDraftRef.current = next;
        return next;
      });
      return;
    }
    if (!marqueeStart.current) return;
    const rect = surfaceRef.current!.getBoundingClientRect();
    const m: Marquee = {
      ...marqueeStart.current,
      x2: e.clientX - rect.left,
      y2: e.clientY - rect.top,
    };
    marqueeRef.current = m;
    setMarquee(m);
  };

  const onSurfaceUp = () => {
    if (createRef.current && createDraftRef.current) {
      const draft = createDraftRef.current;
      createRef.current = null;
      createDraftRef.current = null;
      setCreateDraft(null);
      addNote(draft, 'add-note');
      return;
    }
    const m = marqueeRef.current;
    if (m && marqueeStart.current) {
      const left = Math.min(m.x1, m.x2);
      const right = Math.max(m.x1, m.x2);
      const top = Math.min(m.y1, m.y2);
      const bottom = Math.max(m.y1, m.y2);
      const ids = score.notes
        .filter((n) => {
          const s = beatToSeconds(score, n.start);
          const e = beatToSeconds(score, n.start + n.duration);
          const nx1 = (s - scrollSec) * pxPerSec;
          const nx2 = (e - scrollSec) * pxPerSec;
          const ny1 = yForPitch(n.pitch);
          const ny2 = ny1 + rowHeight;
          return nx2 >= left && nx1 <= right && ny2 >= top && ny1 <= bottom;
        })
        .map((n) => n.id);
      if (ids.length) selectNotes(ids);
    }
    marqueeStart.current = null;
    marqueeRef.current = null;
    setMarquee(null);
  };

  const openLyricEditor = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    const rect = surfaceRef.current!.getBoundingClientRect();
    const x = (beatToSeconds(score, note.start) - scrollSec) * pxPerSec;
    const y = yForPitch(note.pitch);
    setLyricEdit({
      id: note.id,
      x: clamp(x, 0, timelineWidth - 150),
      y: clamp(y - 42, 4, gridHeight - 44),
      value: note.lyric,
    });
  };

  const commitLyric = () => {
    if (!lyricEdit) return;
    const note = score.notes.find((n) => n.id === lyricEdit.id);
    const value = lyricEdit.value.trim();
    if (note && value !== note.lyric) {
      updateNote(note.id, { lyric: value }, 'edit-lyric');
    }
    setLyricEdit(null);
  };

  const selectedNotes = score.notes.filter((n) => selection.includes(n.id));
  const selectedNote = selectedNotes[0];
  const phrases = getPhrases(score);
  const duration = scoreDurationSeconds(score);
  const lyricProblem = selectedNote ? checkLyric(selectedNote.lyric) : null;
  const overlaps = overlappingNotes(score);
  const overlapIds = new Set(overlaps.flatMap(([a, b]) => [a.id, b.id]));

  const noteElements = score.notes
    .map((original) => {
      const note = previewMap.get(original.id) || original;
      const start = beatToSeconds(score, note.start);
      const end = beatToSeconds(score, note.start + note.duration);
      const x = (start - scrollSec) * pxPerSec;
      const w = Math.max(5, (end - start) * pxPerSec - 1);
      if (x + w < -20 || x > timelineWidth + 20) return null;
      const y = yForPitch(note.pitch);
      const h = Math.max(4, rowHeight - 1);
      const selected = selection.includes(note.id);
      const badLyric = !checkLyric(note.lyric).ok;
      return (
        <div
          key={note.id}
          data-note-id={note.id}
          className={clsx(
            'note',
            selected && 'selected',
            badLyric && 'bad-lyric',
            overlapIds.has(note.id) && 'overlap',
            note.breath && 'has-breath',
          )}
          style={{ left: x, top: y, width: w, height: h }}
          title={`${midiToName(note.pitch)} · ${note.lyric || '—'}`}
          onPointerDown={(e) => startNoteDrag(e, note)}
          onPointerMove={handleDragMove}
          onPointerUp={endNoteDrag}
          onDoubleClick={(e) => openLyricEditor(e, note)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            selectNotes([note.id]);
            setContextMenu({ x: e.clientX, y: e.clientY, id: note.id });
          }}
        >
          {w > 18 ? <span className="note-lyric">{note.lyric || '—'}</span> : null}
          {w > 50 ? <span className="note-pitch">{midiToName(note.pitch)}</span> : null}
          {note.breath ? <span className="note-breath">,</span> : null}
          <span className="note-resize" />
        </div>
      );
    })
    .filter(Boolean);

  const draftElement = createDraft
    ? (() => {
        const start = beatToSeconds(score, createDraft.start);
        const end = beatToSeconds(score, createDraft.start + createDraft.duration);
        const x = (start - scrollSec) * pxPerSec;
        const w = Math.max(5, (end - start) * pxPerSec - 1);
        const y = yForPitch(createDraft.pitch);
        return (
          <div
            className="note creating"
            style={{ left: x, top: y, width: w, height: Math.max(4, rowHeight - 1) }}
          >
            {w > 18 ? <span className="note-lyric">{createDraft.lyric}</span> : null}
          </div>
        );
      })()
    : null;

  return (
    <div className="editor-pane" ref={rootRef}>
      <div className="editor-toolbar">
        <div className="tool-segment">
          <IconButton
            icon={<MousePointer2 size={15} />}
            label={t('score.tool.select')}
            active={tool === 'select'}
            onClick={() => setTool('select')}
            size="sm"
          />
          <IconButton
            icon={<Pencil size={15} />}
            label={t('score.tool.pencil')}
            active={tool === 'pencil'}
            onClick={() => setTool('pencil')}
            size="sm"
          />
          <IconButton
            icon={<Eraser size={15} />}
            label={t('score.tool.eraser')}
            active={tool === 'eraser'}
            onClick={() => setTool('eraser')}
            size="sm"
          />
        </div>

        <label className="snap-control">
          <span>{t('score.snap')}</span>
          <select value={snapBeats} onChange={(e) => setSnapBeats(Number(e.target.value))}>
            {SNAP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="toolbar-divider" />
        <IconButton
          icon={<Wind size={15} />}
          label={selectedNote?.breath ? t('score.removeBreath') : t('score.addBreath')}
          disabled={!selectedNotes.length}
          onClick={() => {
            if (!selectedNotes.length) return;
            const value = !selectedNotes.every((n) => n.breath);
            pushHistory('toggle-breath');
            const ids = new Set(selection);
            const notes = score.notes.map((n) => (ids.has(n.id) ? { ...n, breath: value } : n));
            setScore({ ...score, notes });
          }}
        />
        <IconButton
          icon={<Copy size={15} />}
          label={t('score.duplicate')}
          disabled={!selection.length}
          onClick={duplicateSelection}
        />
        <IconButton
          icon={<Trash2 size={15} />}
          label={t('score.deleteNote')}
          disabled={!selection.length}
          onClick={() => deleteNotes(selection, 'delete-note')}
        />
        <IconButton icon={<ListMusic size={15} />} label={t('score.lyricsTitle')} onClick={() => setModal('lyrics')} />

        <div className="toolbar-spacer" />
        <span className="toolbar-meta">
          {t('score.noteCount', { count: score.notes.length })} · {t('score.phraseCount', { count: phrases.length })} ·{' '}
          {duration.toFixed(1)}s
        </span>
        <ZoomBar width={timelineWidth} />
      </div>

      <div className="timeline-body" ref={bodyRef}>
        <div className="timeline-line ruler-line">
          <div className="timeline-gutter" />
          <TimelineRuler width={timelineWidth} />
        </div>
        <div className="timeline-line wave-line">
          <div className="timeline-gutter wave-gutter">
            <Music2 size={13} />
          </div>
          <WaveformStrip width={timelineWidth} height={60} />
        </div>
        <div className="timeline-grid-row" style={{ height: gridHeight }}>
          <PianoKeyboard pitchTop={pitchTop} pitchBottom={pitchBottom} rowHeight={rowHeight} height={gridHeight} rowOffset={rowOffset} />
          <div
            className={clsx(
              'grid-surface',
              tool === 'pencil' && 'tool-pencil',
              tool === 'eraser' && 'tool-eraser',
            )}
            ref={surfaceRef}
            style={{ height: gridHeight }}
            onPointerDown={onSurfaceDown}
            onPointerMove={onSurfaceMove}
            onPointerUp={onSurfaceUp}
            onPointerCancel={() => {
              createRef.current = null;
              createDraftRef.current = null;
              setCreateDraft(null);
              marqueeStart.current = null;
              setMarquee(null);
            }}
          >
            <canvas ref={canvasRef} />
            <Playhead />
            {overlaps.length ? (
              <div className="overlap-warning" role="status">
                <TriangleAlert size={13} />
                <span>{t('score.overlap')}</span>
                <b>{overlaps.length}</b>
              </div>
            ) : null}
            {noteElements}
            {draftElement}
            <PitchScrollbar
              height={gridHeight}
              contentHeight={pitchLayout.contentHeight}
              scroll={timeline.pitchScroll}
              maxScroll={timeline.maxPitchScroll}
              onScroll={timeline.setPitchScroll}
            />
            {marquee ? (
              <div
                className="marquee"
                style={{
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1),
                }}
              />
            ) : null}
            {!score.notes.length ? (
              <div className="empty-overlay" onPointerDown={(e) => e.stopPropagation()}>
                <Music2 size={30} />
                <strong>{t('score.noNotes')}</strong>
                <div className="empty-overlay-actions">
                  <Button variant="primary" size="sm" onClick={() => setTool('pencil')}>
                    <Pencil size={14} /> {t('score.addNote')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void importMusicXmlDialog()}>
                    <Plus size={14} /> {t('welcome.import')}
                  </Button>
                </div>
              </div>
            ) : null}
            {lyricEdit ? (
              <div className="lyric-editor" style={{ left: lyricEdit.x, top: lyricEdit.y }}>
                <div className="lyric-editor-label">{t('score.lyric')}</div>
                <input
                  autoFocus
                  value={lyricEdit.value}
                  onChange={(e) => setLyricEdit({ ...lyricEdit, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitLyric();
                    if (e.key === 'Escape') setLyricEdit(null);
                  }}
                  onBlur={commitLyric}
                  maxLength={24}
                />
                {lyricProblem && !lyricProblem.ok ? (
                  <div className="lyric-editor-hint">{t('errors.lyrics')}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const note = score.notes.find((n) => n.id === contextMenu.id);
              if (note) {
                updateNote(note.id, { breath: !note.breath }, 'toggle-breath');
              }
              setContextMenu(null);
            }}
          >
            <Wind size={14} /> {t('score.addBreath')}
          </button>
          <button
            type="button"
            onClick={() => {
              duplicateSelection();
              setContextMenu(null);
            }}
          >
            <Copy size={14} /> {t('score.duplicate')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              deleteNotes([contextMenu.id], 'delete-note');
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} /> {t('common.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
