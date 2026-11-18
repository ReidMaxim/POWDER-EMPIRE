import type { GroundPoint } from '../lifts/alignment.ts';
import type { Heightmap } from '../terrain.ts';

export const transferBudget = { base: 360, terminal: 65, junction: 38 };
const step = 8;
const riseLimit = .84;
const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);
type Path = readonly GroundPoint[];
const caches = new WeakMap<Heightmap, Map<string, Path | undefined>>();

function safeSegment(map: Heightmap, a: GroundPoint, b: GroundPoint) {
  if ([a,b].some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) ||
    Math.abs(p.x) > map.span / 2 || Math.abs(p.z) > map.span / 2)) return false;
  const count = Math.max(1, Math.ceil(distance(a,b) / 2));
  const limit = distance(a,b) / count * riseLimit + .02;
  let height = map.sample(a.x,a.z).elevation;
  for (let i = 1; i <= count; i++) {
    const x = a.x + (b.x-a.x)*i/count, z = a.z + (b.z-a.z)*i/count;
    const next = map.sample(x,z).elevation;
    if (!Number.isFinite(next) || Math.abs(next-height) > limit) return false;
    height = next;
  }
  return true;
}

/** Waypoints on the snow, excluding the starting position. Base access permits a longer
 * approach than unloading or a trail junction. Budgets include any detour. */
export function pedestrianPath(map: Heightmap, from: GroundPoint, to: GroundPoint, budget: number): Path | undefined {
  if (distance(from,to) > budget) return;
  let cache = caches.get(map);
  if (!cache) caches.set(map,cache = new Map());
  const key = [from.x,from.z,to.x,to.z,budget].join(',');
  if (cache.has(key)) return cache.get(key);
  const destination = {x:to.x,z:to.z};
  type Node = { i:number; j:number; point:GroundPoint; cost:number; priority:number; previous?:Node };
  function search(): Path | undefined {
    if (safeSegment(map,from,to)) return [destination];
    const pending: Node[] = [{i:0,j:0,point:from,cost:0,priority:distance(from,to)}];
    const costs = new Map<string,number>([['0,0',0]]);
    for (let expanded = 0; pending.length && expanded < 1800; expanded++) {
      let nearest = 0;
      for (let i = 1; i < pending.length; i++) if (pending[i].priority < pending[nearest].priority) nearest = i;
      const node = pending.splice(nearest,1)[0];
      if (node.cost !== costs.get(node.i+','+node.j)) continue;
      if (distance(node.point,to) <= step * 1.5 && safeSegment(map,node.point,to)) {
        const result = [destination];
        for (let n = node; n.previous; n = n.previous) result.push(n.point);
        return result.reverse();
      }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const i = node.i+di, j = node.j+dj, index = i+','+j;
        const point = {x:from.x+i*step,z:from.z+j*step};
        const cost = node.cost + Math.hypot(di,dj)*step, priority = cost + distance(point,to);
        if (priority > budget || cost >= (costs.get(index) ?? Infinity) || !safeSegment(map,node.point,point)) continue;
        costs.set(index,cost);
        pending.push({i,j,point,cost,priority,previous:node});
      }
    }
  }
  const route = search();
  if (cache.size >= 3000) cache.clear();
  cache.set(key,route);
  return route;
}
