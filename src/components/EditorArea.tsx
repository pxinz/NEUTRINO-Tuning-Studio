import React from 'react';
import { useAppStore } from '../state/useAppStore';
import ScoreEditor from './editor/ScoreEditor';
import TimingEditor from './editor/TimingEditor';
import PitchEditor from './editor/PitchEditor';
import DynamicsEditor from './editor/DynamicsEditor';
import RightPanel from './RightPanel';

export default function EditorArea() {
  const tab = useAppStore((s) => s.tab);
  return (
    <div className="editor-area">
      <div className="editor-column">
        {tab === 'score' ? <ScoreEditor /> : null}
        {tab === 'timing' ? <TimingEditor /> : null}
        {tab === 'pitch' ? <PitchEditor /> : null}
        {tab === 'dynamics' ? <DynamicsEditor /> : null}
      </div>
      <RightPanel />
    </div>
  );
}
