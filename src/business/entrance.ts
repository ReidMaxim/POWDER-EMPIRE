import type { GroundPoint } from '../lifts/alignment.ts';
import type { Heightmap } from '../terrain.ts';
import type { OperatingLift } from '../lifts/resort.ts';
import { queuePoint } from '../guests/routing.ts';
import type { BuiltTrail } from '../trails/network.ts';
import { pedestrianPath, transferBudget, type Obstacle } from '../trails/transfer.ts';

export const entranceRadius = 10;
const distance = (a: GroundPoint,b: GroundPoint) => Math.hypot(a.x-b.x,a.z-b.z);
export const entranceGate = (point: GroundPoint) => ({x:point.x,z:point.z+12});
export const liftObstacles = (lifts: Iterable<Pick<OperatingLift,'alignment'>>): Obstacle[] =>
  [...lifts].flatMap(({alignment:{lower,upper,towers,ux,uz}}) => {
    const footprint = {ux,uz,side:7.6,along:8.8};
    return [{...lower,radius:11.6,footprint},{...upper,radius:11.6,footprint},...towers.map(t=>({...t,radius:3.2}))];
  });
export const entranceObstacle = (point: GroundPoint): Obstacle =>
  ({...point,radius:entranceRadius,footprint:{ux:0,uz:1,side:9.2,along:9.5}});

export function planEntrance(map: Heightmap, point: GroundPoint, lifts: Iterable<OperatingLift>, trails: Iterable<BuiltTrail>) {
  const radius = entranceRadius, gate = entranceGate(point);
  const stations = [...lifts], runs = [...trails], issues: string[] = [];
  const center = map.sample(point.x,point.z);
  const foundation = [];
  for (let dz=-8; dz<=8; dz+=4) for (let dx=-8; dx<=8; dx+=4) {
    foundation.push(map.sample(point.x+dx,point.z+dz));
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || Math.max(Math.abs(point.x)+radius,Math.abs(gate.z)+3,Math.abs(point.z)+radius) > map.span/2) {
    issues.push('Leave the building and arrival plaza inside the resort boundary.');
  }
  if (distance(point,map.sites.base) > 265 || center.elevation > map.sites.base.elevation+42) {
    issues.push('Choose lower terrain within 265 m of the surveyed base.');
  }
  if (foundation.some(sample=>!Number.isFinite(sample.elevation) || sample.grade>22) ||
    Math.max(...foundation.map(s=>s.elevation))-Math.min(...foundation.map(s=>s.elevation))>2.8) {
    issues.push('The entrance needs a level foundation with no more than 22% grade.');
  }
  if (liftObstacles(stations).some(obstacle => distance(obstacle,point) < radius+obstacle.radius+5 || distance(obstacle,gate)<obstacle.radius+3) ||
    runs.some(({route}) => route.contains(gate) || route.samples.some(p=>distance(p,point)<radius+route.width/2+2))) {
    issues.push('Move the building and arrival plaza away from lifts and trails.');
  }
  const gateSample = map.sample(gate.x,gate.z);
  if (gateSample.grade>24 || Math.abs(gateSample.elevation-center.elevation)>2.8) {
    issues.push('The arrival plaza needs a safe, level approach.');
  }
  const obstacles = [...liftObstacles(stations),entranceObstacle(point)];
  const paths = issues.length ? [] : stations.flatMap(lift => {
    const path = pedestrianPath(map,gate,queuePoint(lift.alignment),transferBudget.base,obstacles);
    return path ? [{lift,path}] : [];
  });
  // Planning an entrance before building a lift is a valid opening-day sequence.
  if (stations.length && !paths.length && !issues.length) issues.push('No safe walking connection to any existing lift.');
  return {issues,gate,paths};
}

export function suggestedEntrance(map: Heightmap, lifts: Iterable<OperatingLift>, trails: Iterable<BuiltTrail>) {
  const stations = [...lifts], runs = [...trails], base = map.sites.base;
  for (const dz of [40,58,24,76,0,-26]) for (const dx of [0,24,-24,42,-42,70,-70,105,-105]) {
    const point = {x:base.x+dx,z:base.z+dz};
    if (!planEntrance(map,point,stations,runs).issues.length) return point;
  }
  return {x:base.x,z:base.z+40};
}
