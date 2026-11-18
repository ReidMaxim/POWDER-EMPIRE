import type { Heightmap } from '../terrain.ts';
import { FIXED_GRIP, planLift, wrapDistance, type GroundPoint, type LiftAlignment } from './alignment.ts';

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
  version: 1;
  seed: string;
  funds: number;
  nextId: number;
  lifts: LiftRecord[];
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

export function freshResort(seed: string): ResortSave {
  return { version: 1, seed, funds: STARTING_FUNDS, nextId: 1, lifts: [] };
}

export function readResort(storage: StoragePort | undefined, legacySeed: string): ResortSave {
  try {
    const save = JSON.parse(storage?.getItem(saveKey) ?? 'null') as ResortSave | null;
    if (!save || save.version !== 1 || !seedValid(save.seed) || !Number.isSafeInteger(save.funds) ||
      save.funds < 0 || save.funds > STARTING_FUNDS || !Number.isSafeInteger(save.nextId) || save.nextId < 1 ||
      !Array.isArray(save.lifts) || save.lifts.length > Math.floor(STARTING_FUNDS / FIXED_GRIP.baseCost) ||
      !save.lifts.every(liftValid)) return freshResort(legacySeed);
    if (new Set(save.lifts.map(lift => lift.id)).size !== save.lifts.length ||
      save.lifts.some(lift => lift.id >= save.nextId)) return freshResort(legacySeed);
    return save;
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
  let nextId = state.nextId, funds = state.funds;
  for (const record of state.lifts) {
    const { alignment } = planLift(map, record.lower, record.upper, alignments());
    if (alignment) lifts.set(record.id, { ...record, alignment, phase: wrapDistance(record.phase, alignment.loopLength) });
  }
  return {
    lifts,
    get funds() { return funds; },
    get nextName() { return `Chairlift ${String(nextId).padStart(2, '0')}`; },
    needsNewResortConfirmation() { return nextId > 1 || funds !== STARTING_FUNDS; },
    propose(lower: GroundPoint, upper: GroundPoint) {
      const result = planLift(map, lower, upper, alignments());
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
      return { lift, issues: [] as string[] };
    },
    toggle(id: number) {
      const lift = lifts.get(id);
      if (lift) lift.running = !lift.running;
    },
    demolish(id: number) { return lifts.delete(id); },
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
      return { version: 1, seed: map.seed, funds, nextId,
        lifts: Array.from(lifts.values(), ({ alignment: _alignment, ...record }) => record) };
    }
  };
}

export function beginNewResort(current: ReturnType<typeof createResort>, seed: string, confirm: () => boolean) {
  if (seed === current.snapshot().seed) return undefined;
  return !current.needsNewResortConfirmation() || confirm() ? freshResort(seed) : undefined;
}
