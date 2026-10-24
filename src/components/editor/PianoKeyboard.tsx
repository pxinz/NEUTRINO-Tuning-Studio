import React from 'react';
import clsx from 'clsx';
import { midiToName } from '../../lib/time';

export default function PianoKeyboard({
  pitchTop,
  pitchBottom,
  rowHeight,
  height,
  rowOffset = 0,
}: {
  pitchTop: number;
  pitchBottom: number;
  rowHeight: number;
  height: number;
  rowOffset?: number;
}) {
  const rows: React.ReactNode[] = [];
  for (let midi = pitchTop; midi >= pitchBottom; midi--) {
    const pc = ((midi % 12) + 12) % 12;
    const black = [1, 3, 6, 8, 10].includes(pc);
    const isC = pc === 0;
    rows.push(
      <div
        key={midi}
        className={clsx('piano-key', black ? 'black' : 'white', isC && 'c-key')}
        style={{ height: rowHeight }}
      >
        {isC ? <span>{midiToName(midi)}</span> : null}
      </div>,
    );
  }
  return (
    <div className="piano-keyboard" style={{ height }}>
      <div className="piano-keys-inner" style={{ top: rowOffset }}>
        {rows}
      </div>
    </div>
  );
}
