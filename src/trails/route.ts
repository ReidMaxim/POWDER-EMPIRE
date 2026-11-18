import { classifyGrade, type Heightmap, type SlopeBand } from '../terrain.ts';
import { FIXED_GRIP, distanceToRun, type GroundPoint, type Point3 } from '../lifts/alignment.ts';

export const TRAIL = {
  widths: [12, 20, 30], minLength: 75, minDrop: 8, maxPoints: 32, maxLength: 2200,
  baseCost: 1000, areaRate: 2, treeRate: 12, upperRadius: 42, lowerRadius: 45, junctionRadius: 25
} as const;
export type TrailWidth = typeof TRAIL.widths[number];
export const isWidth = (n: unknown): n is TrailWidth => TRAIL.widths.some(width => n === width);
export const BANDS: SlopeBand[] = ['beginner', 'intermediate', 'advanced', 'extreme'];
const CELL = 24;
const xy = (a: GroundPoint, b: GroundPoint) => Math.hypot(b.x - a.x, b.z - a.z);
const mix = (a: GroundPoint, b: GroundPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
export type LiftTerminal = { id: number; upper: Point3; lower: Point3; towers?: readonly Point3[] };

export function createFootprint(points: readonly GroundPoint[], radius: number) {
  const grid = new Map<string, number[]>();
  const cell = (n: number) => Math.floor(n / CELL);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    for (let x = cell(Math.min(a.x, b.x) - radius); x <= cell(Math.max(a.x, b.x) + radius); x++) {
      for (let z = cell(Math.min(a.z, b.z) - radius); z <= cell(Math.max(a.z, b.z) + radius); z++) {
        const key = x + ',' + z;
        let segments = grid.get(key);
        if (!segments) grid.set(key, segments = []);
        segments.push(i);
      }
    }
  }
  return (point: GroundPoint) => grid.get(cell(point.x) + ',' + cell(point.z))?.some(i =>
    distanceToRun(point, points[i - 1], points[i]) <= radius) ?? false;
}

export interface RouteSample extends Point3 {
  distance: number;
  rawGrade: number;
  grade: number;
  steep: boolean;
}
export interface TrailRoute {
  samples: RouteSample[];
  width: TrailWidth;
  length: number;
  drop: number;
  average: number;
  maximum: number;
  rawMaximum: number;
  difficulty: SlopeBand;
  distribution: Record<SlopeBand, number>;
  contains: ReturnType<typeof createFootprint>;
  reservesTower: ReturnType<typeof createFootprint>;
  reservesTerminal: ReturnType<typeof createFootprint>;
  treeCount: number;
  cost: number;
}
export interface TrailPlan { route?: TrailRoute; issues: string[]; trees: GroundPoint[] }

function resample(points: readonly GroundPoint[]) {
  const out: GroundPoint[] = [points[0]];
  function line(to: GroundPoint) {
    const from = out[out.length - 1], count = Math.ceil(xy(from, to) / 2.25);
    for (let i = 1; i <= count; i++) out.push(mix(from, to, i / count));
  }
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1], at = points[i], after = points[i + 1];
    // Round corners inside the control polygon, keeping the ends and switchbacks.
    const cut = Math.min(16, xy(before, at) * .24, xy(at, after) * .24);
    const enter = mix(at, before, cut / xy(before, at)), exit = mix(at, after, cut / xy(at, after));
    line(enter);
    const count = Math.max(2, Math.ceil(cut * 2 / 2.25));
    for (let p = 1; p <= count; p++) {
      const t = p / count;
      const step = mix(mix(enter, at, t), mix(at, exit, t), t);
      if (xy(step, out[out.length - 1]) > .001) out.push(step);
    }
  }
  line(points[points.length - 1]);
  return out;
}

export function planTrail(map: Heightmap, points: readonly GroundPoint[], width: TrailWidth,
  lifts: readonly LiftTerminal[] = [], forest: readonly GroundPoint[] = []): TrailPlan {
  const issues: string[] = [], trees: GroundPoint[] = [];
  if (points.length < 2) return { issues: ['Add a downhill waypoint to start the route.'], trees };
  if (points.length > TRAIL.maxPoints) return { issues: ['Use at most 32 waypoints per trail.'], trees };
  const half = map.span / 2, radius = width / 2;
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > half || Math.abs(p.z) > half)) {
    return { issues: ['The trail extends outside the resort boundary.'], trees };
  }
  if (points.some((p, i) => i > 0 && xy(p, points[i - 1]) < 6)) {
    return { issues: ['Space consecutive waypoints at least 6 m apart.'], trees };
  }
  const controlLength = points.reduce((n,p,i) => n + (i ? xy(points[i-1],p) : 0), 0);
  if (controlLength > TRAIL.maxLength * 1.25) return { issues: [`Keep the trail under ${TRAIL.maxLength} m.`], trees };
  const samples: RouteSample[] = [];
  for (const point of resample(points)) {
    const last = samples[samples.length - 1];
    const y = map.sample(point.x, point.z).elevation, step = last ? xy(last, point) : 0;
    if (!Number.isFinite(y)) return { issues: ['The route crosses missing terrain data.'], trees };
    samples.push({ ...point, y, distance: (last?.distance ?? 0) + step,
      rawGrade: last ? 100 * (last.y - y) / step : 0, grade: 0, steep: false });
  }
  const start = samples[0], end = samples[samples.length - 1];
  const length = end.distance, drop = start.y - end.y;
  const contains = createFootprint(samples, radius);
  const reserved = createFootprint(samples, radius + FIXED_GRIP.stationRadius + 1);
  const towerFootprint = createFootprint(samples, radius + 3);
  if (samples.some(p => Math.abs(p.x) + radius > half || Math.abs(p.z) + radius > half)) issues.push('The trail width extends outside the resort boundary.');
  if (lifts.some(lift => reserved(lift.upper) || reserved(lift.lower))) issues.push('Trail intersects a lift station. Leave room beside the terminal.');
  if (lifts.some(lift => lift.towers?.some(towerFootprint))) issues.push('Trail crosses a lift tower footing. Route around the tower.');
  if (length < TRAIL.minLength) issues.push(`Make the trail at least ${TRAIL.minLength} m long.`);
  if (length > TRAIL.maxLength) issues.push(`Keep the trail under ${TRAIL.maxLength} m.`);
  if (drop < TRAIL.minDrop) issues.push(`Trail must finish at least ${TRAIL.minDrop} m below its starting elevation.`);

  let maximum = 0, rawMaximum = 0, upLength = 0, cliffLength = 0, acrossLength = 0;
  let first = 0, last = 0;
  const distribution = { beginner: 0, intermediate: 0, advanced: 0, extreme: 0 };
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i], from = Math.max(0, Math.min(length - 18, p.distance - 9)), to = Math.min(length, from + 18);
    while (first + 1 < samples.length && samples[first + 1].distance <= from) first++;
    while (last + 1 < samples.length && samples[last + 1].distance < to) last++;
    const at = (s: number, j: number) => {
      const a = samples[j], b = samples[Math.min(j + 1, samples.length - 1)];
      return a.y + (b.y - a.y) * (s - a.distance) / (b.distance - a.distance || 1);
    };
    p.grade = 100 * (at(from, first) - at(to, last)) / (to - from);
    maximum = Math.max(maximum, p.grade);
    rawMaximum = Math.max(rawMaximum, p.rawGrade);
    const step = i ? p.distance - samples[i - 1].distance : 0;
    distribution[classifyGrade(Math.max(0, p.grade))] += step;
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(i + 1, samples.length - 1)];
    const tangent = xy(a, b) || 1, nx = (b.z - a.z) / tangent, nz = (a.x - b.x) / tangent;
    const left = map.sample(p.x + nx * radius, p.z + nz * radius).elevation;
    const right = map.sample(p.x - nx * radius, p.z - nz * radius).elevation;
    const crossfall = 100 * Math.max(Math.abs(left - p.y), Math.abs(right - p.y)) / radius;
    upLength = p.grade < -10 ? upLength + step : 0;
    cliffLength = p.grade > 95 ? cliffLength + step : 0;
    acrossLength = crossfall > 95 ? acrossLength + step : 0;
    p.steep = p.grade > 70 || p.grade < -10 || crossfall > 75 || !Number.isFinite(crossfall);
    if (upLength > 15 && !issues.includes('A sustained uphill section is too steep.')) issues.push('A sustained uphill section is too steep.');
    if ((cliffLength > 8 || acrossLength > 10 || !Number.isFinite(crossfall)) &&
      !issues.includes('Route crosses a cliff or an unsafe side slope.')) issues.push('Route crosses a cliff or an unsafe side slope.');
  }
  // A sustained 18 m section controls difficulty, independent of isolated raw spikes.
  for (const tree of forest) if (contains(tree)) trees.push(tree);
  const cost = TRAIL.baseCost + Math.round(length * width * TRAIL.areaRate) + trees.length * TRAIL.treeRate;
  return { issues, trees, route: { samples, width, length, drop, average: drop / length * 100, maximum, rawMaximum,
    difficulty: classifyGrade(maximum), distribution, contains, reservesTerminal: reserved, reservesTower: towerFootprint, treeCount: trees.length, cost } };
}
