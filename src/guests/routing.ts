import type { OperatingLift } from '../lifts/resort.ts';
import type { GroundPoint, LiftAlignment } from '../lifts/alignment.ts';
import type { Heightmap } from '../terrain.ts';
import type { BuiltTrail } from '../trails/network.ts';
import { TRAIL } from '../trails/route.ts';
import { pedestrianPath, transferBudget, type Obstacle } from '../trails/transfer.ts';

export type Skill = 0 | 1 | 2;
export const skillNames = ['Beginner', 'Intermediate', 'Advanced'] as const;
const difficulty = { beginner: 0, intermediate: 1, advanced: 2, extreme: 3 };
export const suits = (trail: BuiltTrail, skill: Skill) => trail.open && difficulty[trail.difficulty] <= skill;
type Path = readonly GroundPoint[];
export interface Circuit {
  lift: OperatingLift; trails: BuiltTrail[];
  arrival: Path; transfers: Path[]; returnPath: Path; departure: Path; exitLift?: number;
}
export interface RoutingAccess { start: GroundPoint; obstacles: readonly Obstacle[] }
type Network = { lifts: ReadonlyMap<number, OperatingLift>; trails: ReadonlyMap<number, BuiltTrail>; routingAccess?: RoutingAccess };
export const walkable = (map: Heightmap, a: GroundPoint, b: GroundPoint) => !!pedestrianPath(map,a,b,transferBudget.base);
const beginning = (trail: BuiltTrail) => trail.route.samples[0];
const ending = (trail: BuiltTrail) => trail.route.samples[trail.route.samples.length-1];
export const lowerGate = 7, unloadFromEnd = 8;
const platformOffset = 5.1;

export function queuePoint(l: LiftAlignment, index = 0) {
  const offset = lowerGate - 2 - index*2.45, side = l.turnRadius + platformOffset;
  return {x:l.lower.x+l.ux*offset-l.uz*side,z:l.lower.z+l.uz*offset+l.ux*side};
}

export function unloadPoint(l: LiftAlignment) {
  const side = l.turnRadius + platformOffset;
  return {x:l.upper.x-l.uz*side+l.ux*3,z:l.upper.z+l.ux*side+l.uz*3};
}

export function evaluateNetwork(resort: Network, map: Heightmap, skill: Skill, focus?: number) {
  const result: Circuit[] = [], reasons = new Set<string>();
  const base = map.sites.base;
  const entryTopology = resort.routingAccess;
  const entry = entryTopology?.start ?? base;
  const accessName = entryTopology ? 'the entrance' : 'the resort base';
  const obstacles = entryTopology?.obstacles;
  const walk = (from: GroundPoint, to: GroundPoint, budget: number) => pedestrianPath(map,from,to,budget,obstacles);
  const usable = [...resort.trails.values()].filter(trail => suits(trail,skill));
  const byId = new Map(usable.map(trail=>[trail.id,trail]));
  const baseAccess = new Map<number, { arrival: Path; departure: Path }>();
  for (const lift of resort.lifts.values()) {
    if (!lift.running) continue;
    const queue = queuePoint(lift.alignment);
    const arrival = walk(entry,queue,transferBudget.base);
    const departure = walk(queue,entry,transferBudget.base);
    if (arrival && departure) baseAccess.set(lift.id,{arrival,departure});
  }

  const upstream = new Set<number>();
  if (focus !== undefined) {
    const queue = [focus];
    for (const id of queue) {
      if (upstream.has(id)) continue;
      upstream.add(id);
      queue.push(...(resort.trails.get(id)?.connections.incomingTrailIds ?? []));
    }
  }
  for (const first of usable) for (const id of first.connections.upperLiftIds) {
    const lift = resort.lifts.get(id);
    const diagnose = focus === undefined || upstream.has(first.id);
    if (!lift?.running) {
      if (diagnose && lift) reasons.add(lift.name + ' is stopped.');
      continue;
    }
    const access = baseAccess.get(id);
    if (!access) {
      if (diagnose) reasons.add('No safe walking route from ' + accessName + ' to ' + lift.name + '.');
      continue;
    }
    const transfer = walk(unloadPoint(lift.alignment),beginning(first),transferBudget.terminal);
    if (!transfer) {
      if (diagnose) reasons.add('No safe transfer from ' + lift.name + ' upper station to the trail start.');
      continue;
    }
    const routes = [{ trails:[first], transfers:[transfer], includesFocus: focus === undefined || first.id === focus }];
    const visited = new Set([first.id+':'+routes[0].includesFocus]);
    for (const path of routes) {
      const last = path.trails[path.trails.length-1], end = ending(last);
      if (path.includesFocus) {
        let exitFound = false;
        for (const lowerId of last.connections.lowerLiftIds) {
          const candidate = resort.lifts.get(lowerId);
          const exitAccess = baseAccess.get(lowerId);
          const returnPath = candidate && walk(end,queuePoint(candidate.alignment),transferBudget.terminal);
          if (exitAccess && returnPath) {
            result.push({lift,trails:path.trails,transfers:path.transfers,arrival:access.arrival,returnPath,
              departure:exitAccess.departure,exitLift:lowerId});
            exitFound = true;
            break;
          }
          if (candidate) reasons.add(!candidate.running ? candidate.name + ' is stopped.' :
            !exitAccess ? 'No safe walking route between ' + candidate.name + ' and ' + accessName + '.' :
            'No safe transfer from the trail end to ' + candidate.name + ' lower station.');
        }
        if (exitFound) break;
        if (last.connections.reachesBase) {
          const returnPath = walk(end,entry,entryTopology ? transferBudget.base : transferBudget.terminal);
          if (returnPath) {
            result.push({lift,trails:path.trails,transfers:path.transfers,arrival:access.arrival,returnPath,departure:[]});
            break;
          }
          reasons.add('No safe walking route from the trail end to ' + accessName + '.');
        }
      }
      for (const nextId of last.connections.outgoingTrailIds) {
        const next = byId.get(nextId);
        if (!next || path.trails.includes(next)) {
          if (!next && path.includesFocus) reasons.add('A connecting trail is closed or exceeds guest skill.');
          continue;
        }
        const includesFocus = path.includesFocus || next.id === focus;
        const key = next.id+':'+includesFocus;
        if (visited.has(key)) continue;
        const crossing = walk(end,beginning(next),transferBudget.junction);
        if (!crossing) {
          if (includesFocus) reasons.add('No safe walking transfer between ' + last.name + ' and ' + next.name + '.');
          continue;
        }
        visited.add(key);
        routes.push({trails:[...path.trails,next],transfers:[...path.transfers,crossing],includesFocus});
      }
    }
  }
  return { circuits: result, reasons: [...reasons] };
}

export function findCircuits(resort: Network, map: Heightmap, skill: Skill): Circuit[] {
  const routes = evaluateNetwork(resort,map,skill).circuits;
  // Retain one usable variant for each reachable branch, even when it shares a start.
  const included = new Set(routes.flatMap(c => c.trails.map(t => t.id)));
  for (const trail of resort.trails.values()) if (suits(trail,skill) && !included.has(trail.id)) {
    for (const route of evaluateNetwork(resort,map,skill,trail.id).circuits) {
      routes.push(route);
      for (const segment of route.trails) included.add(segment.id);
    }
  }
  return routes;
}

export function circuitStatus(resort: Network, map: Heightmap, trail: BuiltTrail) {
  if (!trail.open) return 'Trail closed. Open it to admit guests.';
  if (trail.difficulty === 'extreme') return 'This trail exceeds all current guest skill levels.';
  const eligibility = evaluateNetwork(resort,map,2,trail.id);
  if (eligibility.circuits.length) {
    const skill = ([0,1] as const).find(level => evaluateNetwork(resort,map,level,trail.id).circuits.length) ?? 2;
    return 'Usable circuit · ' + skillNames[skill] + (skill < 2 ? ' or higher' : '');
  }
  const connections = trail.connections;
  if (!connections.reachableUpperLiftIds.length) {
    const start = beginning(trail);
    const distance = Math.min(...[...resort.lifts.values()].map(lift =>
      Math.hypot(start.x-lift.upper.x,start.z-lift.upper.z)));
    const gap = Math.ceil(distance-TRAIL.upperRadius);
    return Number.isFinite(distance) && gap > 0
      ? 'Start is ' + gap + ' m outside the nearest upper connection zone. Move it closer or connect another trail.'
      : 'No upper access. Start at a marked upper anchor or connect a reachable trail.';
  }
  if (eligibility.reasons.length) return eligibility.reasons[0];
  if (!connections.reachesBase && !connections.lowerLiftIds.length && !connections.outgoingTrailIds.length) {
    const end = ending(trail);
    const gap = Math.ceil(Math.min(...[...resort.lifts.values()].map(lift =>
      Math.hypot(end.x-lift.lower.x,end.z-lift.lower.z))) - TRAIL.lowerRadius);
    if (Number.isFinite(gap) && gap > 0) {
      return 'Return route incomplete. End is ' + gap + ' m outside the nearest lower connection zone.';
    }
  }
  return 'Return route incomplete. Finish near a lower anchor, the base, or an open connecting run.';
}
