import { distanceToRun, FIXED_GRIP, type GroundPoint, type LiftAlignment } from '../lifts/alignment.ts';
import type { TrailRoute } from './route.ts';

export function sceneryMasks(lifts: readonly LiftAlignment[], trails: readonly TrailRoute[]) {
  const liftMask = (point: GroundPoint) => lifts.some(plan =>
    Math.hypot(point.x - plan.lower.x, point.z - plan.lower.z) < FIXED_GRIP.stationRadius + 3 ||
    Math.hypot(point.x - plan.upper.x, point.z - plan.upper.z) < FIXED_GRIP.stationRadius + 3 ||
    distanceToRun(point, plan.lower, plan.upper) < FIXED_GRIP.turnRadius + 5);
  return {
    tree: (point: GroundPoint) => liftMask(point) || trails.some(route => route.contains(point)),
    rock: liftMask
  };
}
