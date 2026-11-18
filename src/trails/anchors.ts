import type { Heightmap } from '../terrain.ts';
import { FIXED_GRIP, type GroundPoint } from '../lifts/alignment.ts';
import type { OperatingLift } from '../lifts/resort.ts';
import { queuePoint, unloadPoint } from '../guests/routing.ts';
import { TRAIL, type TrailWidth } from './route.ts';
import { pedestrianPath, transferBudget } from './transfer.ts';

export interface ConnectionZone {
  center: GroundPoint;
  radius: number;
  end: 'Upper' | 'Lower';
  label: string;
  anchors: GroundPoint[];
}

const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x-b.x,a.z-b.z);
const snapRadius = 11;

export function connectionZones(map: Heightmap, operating: Iterable<OperatingLift>, width: TrailWidth) {
  const lifts = [...operating];
  const protectedPoints = lifts.flatMap(({alignment:a}) => [a.lower,a.upper,...a.towers]);
  const clearance = FIXED_GRIP.stationRadius + width/2 + 2;
  const zones: ConnectionZone[] = [];
  for (const lift of lifts) {
    const a = lift.alignment;
    for (const end of ['Upper','Lower'] as const) {
      const upper = end === 'Upper', center = upper ? a.upper : a.lower;
      const radius = upper ? TRAIL.upperRadius : TRAIL.lowerRadius;
      const station = upper ? unloadPoint(a) : queuePoint(a);
      const anchors: GroundPoint[] = [];
      // Prefer anchors on each side of the lift so a player can start either branch.
      for (const side of [1,-1]) for (const along of [24,0,-18]) {
        const lateral = Math.max(clearance+3,23) * side;
        const longitudinal = along * (upper ? -1 : 1);
        const point = {x:center.x+a.ux*longitudinal-a.uz*lateral,z:center.z+a.uz*longitudinal+a.ux*lateral};
        if (distance(center,point) > radius || protectedPoints.some(p=>distance(p,point)<clearance)) continue;
        if (Math.max(Math.abs(point.x),Math.abs(point.z))+width/2 >= map.span/2) continue;
        const sample = map.sample(point.x,point.z);
        if (sample.grade > 40 || Math.abs(sample.elevation-center.y)>18) continue;
        const path = upper ? pedestrianPath(map,station,point,transferBudget.terminal)
          : pedestrianPath(map,point,station,transferBudget.terminal);
        if (path) anchors.push(point);
      }
      zones.push({center,radius,end,label:lift.name,anchors});
    }
  }
  return zones;
}

export function snapEndpoint(point: GroundPoint, zones: readonly ConnectionZone[], end: ConnectionZone['end']) {
  let nearest = snapRadius;
  let snapped: { point: GroundPoint; zone: ConnectionZone } | undefined;
  for (const zone of zones) if (zone.end === end) for (const anchor of zone.anchors) {
    const gap = distance(point,anchor);
    if (gap <= nearest) { nearest=gap; snapped={point:anchor,zone}; }
  }
  return snapped;
}
