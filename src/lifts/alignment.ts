import type { Heightmap } from '../terrain.ts';

export interface GroundPoint { x: number; z: number }
export interface Point3 extends GroundPoint { y: number }

// Retain this version when adding another lift type or changing its geometry.
export const FIXED_GRIP = {
  id: 'fixed-grip-v1', passengers: 2, speed: 2.3, chairSpacing: 34,
  minRun: 100, maxRun: 700, minRise: 12, maxStationGrade: 18,
  stationRadius: 11, turnRadius: 4.6, spacing: 82, minTowerSpacing: 12,
  cableHeight: 12, minClearance: 8, maxTowerHeight: 32, corridor: 25,
  baseCost: 15000, perMeter: 48, perTower: 950
} as const;

export interface LiftAlignment {
  lower: Point3;
  upper: Point3;
  towers: Point3[];
  supports: Point3[];
  cumulative: number[];
  uphillLength: number;
  loopLength: number;
  rise: number;
  ux: number;
  uz: number;
  chairCount: number;
  turnRadius: number;
  cost: number;
}

export type Proposal = { alignment?: LiftAlignment; issues: string[] };
const near = (p: GroundPoint, q: GroundPoint) => Math.hypot(p.x - q.x, p.z - q.z);
const length3 = (p: Point3, q: Point3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const inside = ({x,z}:GroundPoint, half:number, inset:number) => Math.max(Math.abs(x),Math.abs(z)) <= half-inset;

export function distanceToRun(p: GroundPoint, a: GroundPoint, b: GroundPoint) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

function conflict(a: GroundPoint, b: GroundPoint, lift: LiftAlignment) {
  const c = lift.lower, d = lift.upper;
  const cross = (p: GroundPoint, q: GroundPoint, r: GroundPoint) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const crosses = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
  return crosses || Math.min(distanceToRun(a, c, d), distanceToRun(b, c, d),
    distanceToRun(c, a, b), distanceToRun(d, a, b)) < FIXED_GRIP.corridor;
}

export function checkStation(map: Heightmap, point: GroundPoint): string | undefined {
  const { stationRadius, maxStationGrade } = FIXED_GRIP;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return 'Select a point with valid terrain data.';
  if (!inside(point, map.span/2, stationRadius)) return `Leave at least ${stationRadius} m between the terminal and the map edge.`;
  const { elevation, grade } = map.sample(point.x, point.z);
  if (!Number.isFinite(elevation) || !Number.isFinite(grade)) return 'No usable terrain data at this terminal.';
  if (grade > maxStationGrade) return `The terminal footprint must be ${maxStationGrade}% grade or less.`;
  // Test both triangles of every cell touching the station's conservative square envelope.
  const step = map.span / (map.size - 1), half = map.span / 2;
  const cell = (n: number) => Math.floor((n + half) / step);
  for (let j = cell(point.z - stationRadius); j <= cell(point.z + stationRadius); j++) {
    for (let i = cell(point.x - stationRadius); i <= cell(point.x + stationRadius); i++) {
      for (const t of [.25, .75]) {
        const sample = map.sample((i + t) * step - half, (j + t) * step - half);
        if (!Number.isFinite(sample.elevation) || !Number.isFinite(sample.grade)) return 'The terminal footprint has missing terrain data.';
        if (sample.grade > maxStationGrade) return `The terminal footprint must be ${maxStationGrade}% grade or less.`;
      }
    }
  }
}

export function planLift(map: Heightmap, a: GroundPoint, b: GroundPoint, existing: Iterable<LiftAlignment> = []): Proposal {
  const rule = FIXED_GRIP;
  const issues: string[] = [];
  const lowerIssue = checkStation(map, a), upperIssue = checkStation(map, b);
  if (lowerIssue) issues.push('Lower terminal: ' + lowerIssue);
  if (upperIssue) issues.push('Upper terminal: ' + upperIssue);
  if (issues.length) return { issues };
  const lower = { x: a.x, z: a.z, y: map.sample(a.x, a.z).elevation };
  const upper = { x: b.x, z: b.z, y: map.sample(b.x, b.z).elevation };
  const run = near(lower, upper), rise = upper.y - lower.y;
  if (rise < rule.minRise) issues.push(`The upper terminal must be at least ${rule.minRise} m higher.`);
  if (run < rule.minRun || run > rule.maxRun) issues.push(`Choose terminals ${rule.minRun}–${rule.maxRun} m apart horizontally.`);
  if ([...existing].some(lift => conflict(a, b, lift))) issues.push(`Leave ${rule.corridor} m between alignments and avoid crossing another lift.`);
  if (issues.length) return { issues };
  const ux = (b.x - a.x) / run, uz = (b.z - a.z) / run;
  const groundAt = (x: number, z: number) => {
    let elevation = -Infinity;
    for (const side of [-rule.turnRadius, 0, rule.turnRadius]) {
      elevation = Math.max(elevation, map.sample(x - uz * side, z + ux * side).elevation);
    }
    return elevation;
  };

  const supports = [{ ...lower, y: lower.y + rule.cableHeight }];
  const spans = Math.ceil(run / rule.spacing);
  for (let i = 1; i < spans; i++) {
    const x = lower.x + ux * run * i / spans, z = lower.z + uz * run * i / spans;
    supports.push({ x, z, y: groundAt(x, z) + rule.cableHeight });
  }
  supports.push({ ...upper, y: upper.y + rule.cableHeight });
  for (let i = 0; i < supports.length - 1;) {
    const p = supports[i], q = supports[i + 1], span = near(p, q);
    const samples = Math.ceil(span / 1.5);
    let worst = 0, insert: Point3 | undefined;
    for (let j = 0; j <= samples; j++) {
      const t = j / samples;
      const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      const ground = groundAt(x, z);
      if (!Number.isFinite(ground)) return { issues: ['The cable route crosses missing terrain data.'] };
      const shortage = ground + rule.minClearance - (p.y + (q.y - p.y) * t);
      if (shortage > worst) {
        worst = shortage;
        insert = { x, z, y: ground + rule.cableHeight };
      }
    }
    if (!insert) {
      i++;
      continue;
    }
    if (near(p, insert) < rule.minTowerSpacing || near(q, insert) < rule.minTowerSpacing || supports.length >= 32) {
      return { issues: ['The cable cannot clear this terrain. Move a terminal to avoid the ridge or steep break.'] };
    }
    supports.splice(i + 1, 0, insert);
  }

  const towers = supports.slice(1, -1);
  if (towers.some(p => p.y - map.sample(p.x, p.z).elevation > rule.maxTowerHeight)) {
    return { issues: [`A support tower would exceed ${rule.maxTowerHeight} m. Try another alignment.`] };
  }
  const cumulative = [0];
  for (let i = 1; i < supports.length; i++) cumulative.push(cumulative[i - 1] + length3(supports[i - 1], supports[i]));
  const uphillLength = cumulative[cumulative.length - 1];
  const loopLength = uphillLength * 2 + Math.PI * rule.turnRadius * 2;
  const cost = rule.baseCost + Math.round(uphillLength * rule.perMeter) + towers.length * rule.perTower;
  return { issues, alignment: {
    lower, upper, towers, supports, cumulative, uphillLength, loopLength, rise, ux, uz, cost, turnRadius: rule.turnRadius,
    chairCount: Math.max(4, Math.floor(loopLength / rule.chairSpacing))
  } };
}

export interface ChairPose extends Point3 { yaw: number }
export const wrapDistance = (distance: number, length: number) => ((distance % length) + length) % length;

export function sampleLoop(lift: LiftAlignment, distance: number, out: ChairPose): void {
  const { uphillLength: length, ux, uz, supports, cumulative } = lift;
  const radius = lift.turnRadius, arc = Math.PI * radius;
  const d = wrapDistance(distance, lift.loopLength);
  const returning = d >= length + arc;
  const s = returning ? d - length - arc : d;
  const side = returning ? -1 : 1;
  if (s >= length) {
    const at = returning ? supports[0] : supports[supports.length - 1];
    const angle = (s - length) / radius;
    const along = Math.sin(angle) * side, across = Math.cos(angle) * side;
    out.x = at.x + radius * (ux * along - uz * across);
    out.z = at.z + radius * (uz * along + ux * across);
    out.y = at.y;
    out.yaw = Math.atan2(ux * across + uz * along, uz * across - ux * along);
    return;
  }
  const along = returning ? length - s : s;
  let i = 1;
  while (i < supports.length - 1 && along > cumulative[i]) i++;
  const p = supports[i - 1], q = supports[i];
  const t = (along - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
  out.x = p.x + (q.x - p.x) * t - uz * radius * side;
  out.z = p.z + (q.z - p.z) * t + ux * radius * side;
  out.y = p.y + (q.y - p.y) * t;
  out.yaw = Math.atan2(ux * side, uz * side);
}

export function chairDistance(lift: LiftAlignment, phase: number, index: number) {
  return phase + index * lift.loopLength / lift.chairCount;
}
