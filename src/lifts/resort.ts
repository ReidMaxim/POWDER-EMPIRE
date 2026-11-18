import type { Heightmap } from '../terrain.ts';
import { FIXED_GRIP, planLift, wrapDistance, type GroundPoint, type LiftAlignment } from './alignment.ts';

import { BANDS, TRAIL, isWidth, planTrail, type TrailWidth } from '../trails/route.ts';
import { analyzeConnections, directConnections, type BuiltTrail, type TrailRecord } from '../trails/network.ts';

export const STARTING_FUNDS = 250000;
const saveKey = 'powder-empire.resort';

export interface LiftRecord {
  id: number;
  name: string;
  configuration: typeof FIXED_GRIP.id;
  lower: GroundPoint;
  upper: GroundPoint;
  running: boolean;
  phase: number;
}

export interface ResortSave {
  version: 2;
  seed: string;
  funds: number;
  nextId: number;
  lifts: LiftRecord[];
  trails: TrailRecord[];
  nextTrailId: number;
}

export interface OperatingLift extends LiftRecord { alignment: LiftAlignment }
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

const seedValid = (seed: unknown): seed is string =>
  typeof seed === 'string' && seed.length <= 40 && seed.length > 0 && seed.trim() === seed;

function pointValid(point: unknown): point is GroundPoint {
  return !!point && typeof point === 'object' && 'x' in point && 'z' in point &&
    Number.isFinite(point.x) && Number.isFinite(point.z);
}

function liftValid(value: unknown): value is LiftRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as LiftRecord;
  return Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === 'string' && item.name.length > 0 &&
    item.name.length <= 50 && item.configuration === FIXED_GRIP.id &&
    pointValid(item.lower) && pointValid(item.upper) && typeof item.running === 'boolean' &&
    Number.isFinite(item.phase) && item.phase >= 0;
}

function trailValid(value: unknown): value is TrailRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as TrailRecord;
  return Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === 'string' &&
    item.name.trim().length > 0 && item.name.length <= 50 && isWidth(item.width) &&
    typeof item.open === 'boolean' && BANDS.includes(item.difficulty) && Number.isSafeInteger(item.cost) &&
    item.cost >= TRAIL.baseCost && item.cost <= STARTING_FUNDS && Array.isArray(item.points) &&
    item.points.length >= 2 && item.points.length <= TRAIL.maxPoints && item.points.every(pointValid);
}

export function freshResort(seed: string): ResortSave {
  return { version: 2, seed, funds: STARTING_FUNDS, nextId: 1, lifts: [], trails: [], nextTrailId: 1 };
}

export function readResort(storage: StoragePort | undefined, legacySeed: string): ResortSave {
  try {
    const save = JSON.parse(storage?.getItem(saveKey) ?? 'null') as (Omit<ResortSave, 'version'> & { version: number }) | null;
    if (!save || (save.version !== 1 && save.version !== 2) || !seedValid(save.seed) || !Number.isSafeInteger(save.funds) ||
      save.funds < 0 || save.funds > STARTING_FUNDS || !Number.isSafeInteger(save.nextId) || save.nextId < 1 ||
      !Array.isArray(save.lifts) || save.lifts.length > Math.floor(STARTING_FUNDS / FIXED_GRIP.baseCost) ||
      !save.lifts.every(liftValid)) return freshResort(legacySeed);
    if (new Set(save.lifts.map(lift => lift.id)).size !== save.lifts.length ||
      save.lifts.some(lift => lift.id >= save.nextId)) return freshResort(legacySeed);
    const base = { ...freshResort(save.seed), funds: save.funds, nextId: save.nextId, lifts: save.lifts };
    if (save.version === 1) return base;
    if (!Array.isArray(save.trails) || !Number.isSafeInteger(save.nextTrailId) || save.nextTrailId < 1) return base;
    const trails = save.trails.filter(trailValid).filter(trail => trail.id < save.nextTrailId);
    return { ...base, nextTrailId: save.nextTrailId, trails: [...new Map(trails.map(trail => [trail.id, trail])).values()] };
  } catch {
    return freshResort(legacySeed);
  }
}

export function writeResort(storage: StoragePort | undefined, save: ResortSave) {
  try {
    if (!storage) return false;
    storage.setItem(saveKey, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function createResort(map: Heightmap, save: ResortSave) {
  const state = save.seed === map.seed ? save : freshResort(map.seed);
  const lifts = new Map<number, OperatingLift>();
  const alignments = () => Array.from(lifts.values(), lift => lift.alignment);
  const trails = new Map<number, BuiltTrail>();
  const terminals = () => Array.from(lifts.values(), lift => ({ id: lift.id, lower: lift.alignment.lower, upper: lift.alignment.upper, towers: lift.alignment.towers }));
  let nextId = state.nextId, funds = state.funds, nextTrailId = state.nextTrailId;
  for (const record of state.lifts) {
    const { alignment } = planLift(map, record.lower, record.upper, alignments());
    if (alignment) lifts.set(record.id, { ...record, alignment, phase: wrapDistance(record.phase, alignment.loopLength) });
  }
  for (const record of state.trails) {
    const { route, issues } = planTrail(map, record.points, record.width, terminals());
    if (!route || issues.length) continue;
    trails.set(record.id, { ...record, difficulty: route.difficulty, route,
      connections: directConnections(map, record.id, route, terminals(), []) });
  }

  function refreshConnections() {
    const stations = terminals();
    for (const trail of trails.values()) trail.connections = directConnections(map, trail.id, trail.route, stations, trails.values());
    for (const trail of trails.values()) analyzeConnections(trail.connections, trails, trail.id);
  }
  refreshConnections();

  function proposeTrail(points: readonly GroundPoint[], width: TrailWidth, forest: readonly GroundPoint[] = []) {
    const proposal = planTrail(map, points, width, terminals(), forest);
    if (proposal.route && proposal.route.cost > funds) proposal.issues.push('Insufficient resort funds.');
    const connections = proposal.route ? analyzeConnections(directConnections(map, 0, proposal.route, terminals(), trails.values()), trails) : undefined;
    return { ...proposal, connections };
  }

  return {
    lifts,
    trails,
    get nextTrailName() { return `Trail ${String(nextTrailId).padStart(2, '0')}`; },
    proposeTrail,
    constructTrail(points: readonly GroundPoint[], width: TrailWidth, forest: readonly GroundPoint[]) {
      const proposal = proposeTrail(points, width, forest);
      const { route, connections } = proposal;
      if (!route || !connections || proposal.issues.length) return undefined;
      const trail: BuiltTrail = { id: nextTrailId, name: this.nextTrailName, points: points.map(({x,z}) => ({x,z})),
        width, open: true, difficulty: route.difficulty, cost: route.cost, route, connections };
      trails.set(nextTrailId++, trail);
      funds -= trail.cost;
      refreshConnections();
      return trail;
    },
    renameTrail(id: number, name: string) {
      const trail = trails.get(id), normalized = name.trim().slice(0, 50);
      if (!trail || !normalized || normalized === trail.name) return false;
      trail.name = normalized;
      return true;
    },
    toggleTrail(id: number) {
      const trail = trails.get(id);
      if (!trail) return false;
      trail.open = !trail.open;
      refreshConnections();
      return true;
    },
    demolishTrail(id: number) {
      if (!trails.delete(id)) return false;
      refreshConnections();
      return true;
    },
    get funds() { return funds; },
    get nextName() { return `Chairlift ${String(nextId).padStart(2, '0')}`; },
    needsNewResortConfirmation() { return nextId > 1 || nextTrailId > 1 || funds !== STARTING_FUNDS; },
    propose(lower: GroundPoint, upper: GroundPoint) {
      const result = planLift(map, lower, upper, alignments());
      const alignment = result.alignment;
      if (alignment && [...trails.values()].some(({route}) =>
        route.reservesTerminal(lower) || route.reservesTerminal(upper) || alignment.towers.some(route.reservesTower))) {
        result.issues.push('A lift station or tower overlaps an existing trail. Move the alignment away from the corridor.');
      }
      if (result.alignment && result.alignment.cost > funds) result.issues.push('Insufficient resort funds.');
      return result;
    },
    construct(lower: GroundPoint, upper: GroundPoint) {
      const result = this.propose(lower, upper);
      if (!result.alignment || result.issues.length) return { lift: undefined, issues: result.issues };
      const lift: OperatingLift = {
        id: nextId, name: this.nextName, configuration: FIXED_GRIP.id,
        lower: { x: lower.x, z: lower.z }, upper: { x: upper.x, z: upper.z }, running: true, phase: 0, alignment: result.alignment
      };
      lifts.set(nextId++, lift);
      funds -= lift.alignment.cost;
      refreshConnections();
      return { lift, issues: [] as string[] };
    },
    toggle(id: number) {
      const lift = lifts.get(id);
      if (lift) lift.running = !lift.running;
    },
    demolish(id: number) {
      if (!lifts.delete(id)) return false;
      refreshConnections();
      return true;
    },
    advance(seconds: number) {
      if (!(seconds > 0) || !Number.isFinite(seconds)) return false;
      let moved = false;
      for (const lift of lifts.values()) {
        if (!lift.running) continue;
        moved = true;
        lift.phase = wrapDistance(lift.phase + seconds * FIXED_GRIP.speed, lift.alignment.loopLength);
      }
      return moved;
    },
    snapshot(): ResortSave {
      return { version: 2, seed: map.seed, funds, nextId, nextTrailId,
        lifts: Array.from(lifts.values(), ({ alignment: _alignment, ...record }) => record),
        trails: Array.from(trails.values(), ({ route: _route, ...record }) => record) };
    }
  };
}

export function beginNewResort(current: ReturnType<typeof createResort>, seed: string, confirm: () => boolean) {
  if (seed === current.snapshot().seed) return undefined;
  return !current.needsNewResortConfirmation() || confirm() ? freshResort(seed) : undefined;
}
