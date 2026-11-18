import type { Heightmap, SlopeBand } from '../terrain.ts';
import type { GroundPoint } from '../lifts/alignment.ts';
import { TRAIL, type LiftTerminal, type TrailRoute, type TrailWidth } from './route.ts';

export interface TrailConnections {
  upperLiftIds: number[];
  lowerLiftIds: number[];
  incomingTrailIds: number[];
  outgoingTrailIds: number[];
  reachesBase: boolean;
  reachableUpperLiftIds: number[];
  reachableLowerLiftIds: number[];
  returnsToBase: boolean;
  state: 'Connected' | 'Partial' | 'Isolated';
}
export interface TrailRecord {
  id: number;
  name: string;
  points: GroundPoint[];
  width: TrailWidth;
  difficulty: SlopeBand;
  open: boolean;
  cost: number;
  connections: TrailConnections;
}
export interface BuiltTrail extends TrailRecord { route: TrailRoute }

const near = (a: GroundPoint, b: GroundPoint, radius: number) => Math.hypot(a.x - b.x, a.z - b.z) <= radius;
const vertical = (a: {y:number}, b: {y:number}) => Math.abs(a.y - b.y) <= 18;
const endpoints = (route: TrailRoute) => [route.samples[0], route.samples[route.samples.length - 1]] as const;
export function directConnections(map: Heightmap, id: number, route: TrailRoute,
  lifts: readonly LiftTerminal[], trails: Iterable<BuiltTrail>): TrailConnections {
  const [start, end] = endpoints(route);
  const upperLiftIds = lifts.filter(l => near(l.upper, start, TRAIL.upperRadius) && vertical(l.upper, start)).map(l => l.id);
  const lowerLiftIds = lifts.filter(l => near(l.lower, end, TRAIL.lowerRadius) && vertical(l.lower, end)).map(l => l.id);
  const incomingTrailIds: number[] = [], outgoingTrailIds: number[] = [];
  for (const trail of trails) {
    if (trail.id === id) continue;
    const [otherStart, otherEnd] = endpoints(trail.route);
    if (near(start, otherEnd, TRAIL.junctionRadius) && vertical(start, otherEnd)) incomingTrailIds.push(trail.id);
    if (near(end, otherStart, TRAIL.junctionRadius) && vertical(end, otherStart)) outgoingTrailIds.push(trail.id);
  }
  return { upperLiftIds, lowerLiftIds, incomingTrailIds, outgoingTrailIds,
    reachesBase: near(end, map.sites.base, map.sites.base.radius + 18) &&
      Math.abs(end.y - map.sites.base.elevation) <= 18, reachableUpperLiftIds: [], reachableLowerLiftIds: [], returnsToBase: false, state: 'Isolated' };
}

export function analyzeConnections(direct: TrailConnections, trails: ReadonlyMap<number, BuiltTrail>, origin = 0) {
  const follow = (access: boolean) => {
    const visited = new Set([origin]);
    const queue = access ? [...direct.incomingTrailIds] : [...direct.outgoingTrailIds];
    const ids = new Set(access ? direct.upperLiftIds : direct.lowerLiftIds);
    let base = direct.reachesBase;
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      const trail = trails.get(id);
      if (!trail?.open) continue;
      const link = trail.connections;
      for (const liftId of access ? link.upperLiftIds : link.lowerLiftIds) ids.add(liftId);
      if (!access) base ||= link.reachesBase;
      queue.push(...(access ? link.incomingTrailIds : link.outgoingTrailIds));
    }
    return { ids: [...ids].sort((a,b) => a-b), base };
  };
  const up = follow(true), down = follow(false);
  direct.reachableUpperLiftIds = up.ids;
  direct.reachableLowerLiftIds = down.ids;
  direct.returnsToBase = down.base;
  const access = up.ids.length > 0, exit = down.base || down.ids.length > 0;
  direct.state = access && exit ? 'Connected' : access || exit ? 'Partial' : 'Isolated';
  return direct;
}
