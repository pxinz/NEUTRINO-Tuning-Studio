import type { Dynamics, DynamicsPoint } from './types';
import { clamp, dbToGain } from './time';

export const DYNAMICS_MIN_DB = -24;
export const DYNAMICS_MAX_DB = 12;

export function defaultDynamics(duration = 0): Dynamics {
  return {
    enabled: false,
    points: [
      { time: 0, db: 0 },
      ...(duration > 0 ? [{ time: duration, db: 0 }] : []),
    ],
  };
}

export function normalizeDynamics(dynamics: Dynamics | null | undefined, duration = 0): Dynamics {
  const points = (dynamics?.points || [])
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.db))
    .map((p) => ({
      time: Math.max(0, p.time),
      db: clamp(p.db, DYNAMICS_MIN_DB, DYNAMICS_MAX_DB),
    }))
    .sort((a, b) => a.time - b.time);
  if (!points.length) points.push({ time: 0, db: 0 });
  if (duration > 0 && points[points.length - 1].time < duration - 1e-4) {
    points.push({ time: duration, db: points[points.length - 1].db });
  }
  return { enabled: Boolean(dynamics?.enabled), points };
}

export function gainAt(points: DynamicsPoint[], time: number): number {
  if (!points.length) return 1;
  if (time <= points[0].time) return dbToGain(points[0].db);
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (time <= b.time) {
      const a = points[i - 1];
      const span = b.time - a.time;
      const t = span <= 1e-9 ? 0 : (time - a.time) / span;
      return dbToGain(a.db + (b.db - a.db) * t);
    }
  }
  return dbToGain(points[points.length - 1].db);
}

export function dbAt(points: DynamicsPoint[], time: number): number {
  return 20 * Math.log10(Math.max(1e-6, gainAt(points, time)));
}

export function addDynamicsPoint(
  points: DynamicsPoint[],
  time: number,
  db: number,
  duration = 0,
): DynamicsPoint[] {
  const p = { time: Math.max(0, time), db: clamp(db, DYNAMICS_MIN_DB, DYNAMICS_MAX_DB) };
  const out = points.filter((q) => Math.abs(q.time - p.time) > 0.004);
  out.push(p);
  out.sort((a, b) => a.time - b.time);
  if (duration > 0 && out[out.length - 1].time < duration - 1e-4) {
    out.push({ time: duration, db: out[out.length - 1].db });
  }
  return out;
}

export function moveDynamicsPoint(
  points: DynamicsPoint[],
  index: number,
  time: number,
  db: number,
  duration = 0,
): DynamicsPoint[] {
  if (index < 0 || index >= points.length) return points;
  const out = points.map((p) => ({ ...p }));
  out[index].time = clamp(time, 0, duration || time);
  out[index].db = clamp(db, DYNAMICS_MIN_DB, DYNAMICS_MAX_DB);
  out.sort((a, b) => a.time - b.time);
  return out;
}

export function removeDynamicsPoint(points: DynamicsPoint[], index: number): DynamicsPoint[] {
  if (index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}

export function smoothDynamics(points: DynamicsPoint[], strength = 0.5): DynamicsPoint[] {
  if (points.length < 3) return points;
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return { ...p };
    const prev = points[i - 1];
    const next = points[i + 1];
    return {
      time: p.time,
      db: clamp(p.db * (1 - strength) + ((prev.db + next.db) / 2) * strength, DYNAMICS_MIN_DB, DYNAMICS_MAX_DB),
    };
  });
}

export function resetDynamics(duration: number): Dynamics {
  return { enabled: true, points: defaultDynamics(duration).points };
}

export function dynamicsPointsForDuration(points: DynamicsPoint[], duration: number): DynamicsPoint[] {
  if (duration <= 0) return points;
  const out = points.filter((p) => p.time <= duration + 1e-6);
  if (!out.length) return [{ time: 0, db: 0 }, { time: duration, db: 0 }];
  if (out[out.length - 1].time < duration - 1e-4) {
    out.push({ time: duration, db: out[out.length - 1].db });
  }
  return out;
}
