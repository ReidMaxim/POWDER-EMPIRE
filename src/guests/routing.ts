import type { createResort, OperatingLift } from '../lifts/resort.ts';
import type { GroundPoint } from '../lifts/alignment.ts';
import type { Heightmap } from '../terrain.ts';
import type { BuiltTrail } from '../trails/network.ts';

export type Skill = 0 | 1 | 2;
export const skillNames = ['Beginner', 'Intermediate', 'Advanced'] as const;
const difficulty = { beginner: 0, intermediate: 1, advanced: 2, extreme: 3 };
export const suits = (trail: BuiltTrail, skill: Skill) => trail.open && difficulty[trail.difficulty] <= skill;
export interface Circuit { lift: OperatingLift; trails: BuiltTrail[]; exit: GroundPoint; exitLift?: number }
type Resort = ReturnType<typeof createResort>;

export function walkable(map: Heightmap, a: GroundPoint, b: GroundPoint) {
  const distance = Math.hypot(a.x-b.x,a.z-b.z);
  if (distance > 180) return false;
  const steps = Math.max(1,Math.ceil(distance/4));
  let last = map.sample(a.x,a.z).elevation;
  for (let i=1;i<=steps;i++) {
    const y = map.sample(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps).elevation;
    if (!Number.isFinite(y) || Math.abs(y-last) > distance/steps * .84 + .05) return false;
    last = y;
  }
  return true;
}

export function findCircuits(resort: Resort, map: Heightmap, skill: Skill): Circuit[] {
  const result: Circuit[] = [];
  const base = map.sites.base;
  const usable = [...resort.trails.values()].filter(trail => suits(trail,skill));
  const byId = new Map(usable.map(trail=>[trail.id,trail]));
  for (const lift of resort.lifts.values()) {
    if (!lift.running || !walkable(map,base,lift.alignment.lower)) continue;
    for (const first of usable) {
      if (!first.connections.upperLiftIds.includes(lift.id) ||
        !walkable(map,lift.alignment.upper,first.route.samples[0])) continue;
      const visited = new Set([first.id]);
      const routes = [[first]];
      for (const path of routes) {
        const trail = path[path.length-1], end = trail.route.samples[trail.route.samples.length-1];
        const lower = trail.connections.lowerLiftIds.map(id=>resort.lifts.get(id))
          .find(candidate=>candidate?.running && walkable(map,end,candidate.alignment.lower) &&
            walkable(map,candidate.alignment.lower,base));
        const reachesBase = trail.connections.reachesBase && walkable(map,end,base);
        if (lower || reachesBase) {
          result.push({lift,trails:path,exit:lower?.alignment.lower ?? base,exitLift:lower?.id});
          break;
        }
        for (const id of trail.connections.outgoingTrailIds) {
          const next = byId.get(id);
          if (next && !visited.has(id) && walkable(map,end,next.route.samples[0])) {
            visited.add(id);
            routes.push([...path,next]);
          }
        }
      }
    }
  }
  return result;
}
