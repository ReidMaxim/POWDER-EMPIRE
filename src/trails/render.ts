import * as T from 'three';
import type { Heightmap } from '../terrain';
import type { GroundPoint } from '../lifts/alignment';
import type { BuiltTrail } from './network';
import { conformSurface } from './conform';
import type { TrailPlan, TrailRoute } from './route';

export const trailColors = { beginner: '#359c68', intermediate: '#3a8bb7', advanced: '#303e50', extreme: '#1d2737' };
const snow = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 1,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const preview = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: .56, depthWrite: false });
const flag = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide });
const dots = new T.PointsMaterial({color: '#f5a864', size: 5, sizeAttenuation: false, depthTest: false });
const groomed = new T.Color('#d4e7ef'), edge = new T.Color('#9fbdcc');
const green = new T.Color('#329762'), red = new T.Color('#e26e3f');

function positions(values: number[]) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(values, 3));
  return g;
}

function ribbon(map: Heightmap, route: TrailRoute, draft = false, invalid = false) {
  const data: number[] = [], colors: number[] = [], indices: number[] = [];
  const columns = Math.ceil(route.width / 2.2);
  const stride = columns + 1;
  const color = new T.Color();
  for (let i = 0; i < route.samples.length; i++) {
    const p = route.samples[i], a = route.samples[Math.max(0, i - 1)], b = route.samples[Math.min(route.samples.length - 1, i + 1)];
    const denominator = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = (b.z - a.z) / denominator, nz = (a.x - b.x) / denominator;
    for (let j = 0; j <= columns; j++) {
      const span = (j / columns - .5) * route.width;
      const x = p.x + nx * span, z = p.z + nz * span;
      data.push(x, map.sample(x, z).elevation + .65, z);
      if (draft) color.copy(invalid || p.steep ? red : green);
      else color.copy(groomed).lerp(edge, j === 0 || j === columns ? .82 : j % 2 === 0 ? .12 : .04);
      colors.push(color.r, color.g, color.b);
      if (i && j) {
        const at = i * stride + j;
        indices.push(at - stride - 1, at - 1, at, at - stride - 1, at, at - stride);
      }
    }
  }
  // Short rounded caps match the capsule-shaped clearing at each end.
  for (const i of [0, route.samples.length - 1]) {
    const p = route.samples[i], next = route.samples[i ? i - 1 : 1];
    const length = Math.hypot(p.x - next.x, p.z - next.z) || 1;
    const ux = (p.x - next.x) / length, uz = (p.z - next.z) / length;
    const center = data.length / 3;
    data.push(p.x, p.y + .65, p.z);
    color.copy(draft ? (invalid || p.steep ? red : green) : groomed);
    colors.push(color.r, color.g, color.b);
    const rings = Math.ceil(route.width / 4.4);
    for (let ring = 1; ring <= rings; ring++) {
      const radius = route.width / 2 * ring / rings;
      for (let j = 0; j <= 12; j++) {
        const angle = Math.PI * j / 12;
        const x = p.x + (ux * Math.sin(angle) - uz * Math.cos(angle)) * radius;
        const z = p.z + (uz * Math.sin(angle) + ux * Math.cos(angle)) * radius;
        const i = data.length / 3;
        data.push(x, map.sample(x, z).elevation + .65, z);
        if (!draft) color.copy(ring === rings ? edge : groomed);
        colors.push(color.r, color.g, color.b);
        if (j && ring === 1) indices.push(center, i - 1, i);
        else if (j) indices.push(i - 14, i - 13, i, i - 14, i, i - 1);
      }
    }
  }
  const conforming = draft ? undefined : conformSurface(map, data, colors, indices, .10);
  const geometry = positions(conforming?.positions ?? data);
  geometry.setAttribute('color', new T.Float32BufferAttribute(conforming?.colors ?? colors, 3));
  if (!conforming) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new T.Mesh(geometry, draft ? preview : snow);
}

function line(route: TrailRoute, color: string, opacity: number) {
  const data: number[] = [];
  for (const pt of route.samples) data.push(pt.x, pt.y + 1.7, pt.z);
  return new T.Line(positions(data), new T.LineBasicMaterial({ color, transparent: true, opacity }));
}

function signs(map: Heightmap, route: TrailRoute, color: string) {
  const data: number[] = [], colors: number[] = [];
  function quad(a: number[], b: number[], c: number[], d: number[], tint: T.Color) {
    for (const p of [a,b,c,a,c,d]) {
      data.push(...p);
      colors.push(tint.r,tint.g,tint.b);
    }
  }
  const sign = new T.Color(color), post = new T.Color('#526662');
  const samples = route.samples;
  for (const [i, near] of [[0, 1], [samples.length - 1, samples.length - 2]]) {
    const a = samples[i], b = samples[near], d = Math.hypot(a.x-b.x,a.z-b.z) || 1;
    const nx = (a.z-b.z)/d, nz = (b.x-a.x)/d;
    for (const side of [-1,1]) {
      const x = side*(route.width/2 - 1);
      const ground = map.sample(a.x+nx*x,a.z+nz*x).elevation;
      const pos = (u: number,y: number) => [a.x+nx*u,ground+y,a.z+nz*u];
      quad(pos(x-.22,-.7),pos(x+.22,-.7),pos(x+.22,6.2),pos(x-.22,6.2),post);
      quad(pos(x-.8,4.1),pos(x+.8,4.1),pos(x+.8,6.25),pos(x-.8,6.25),sign);
    }
  }
  const geo = positions(data);
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  return new T.Mesh(geo,flag);
}

function free(group: T.Group) {
  group.removeFromParent();
  group.traverse(obj => {
    if (obj instanceof T.Mesh || obj instanceof T.Line || obj instanceof T.Points) obj.geometry.dispose();
    if (obj instanceof T.Line) obj.material.dispose();
  });
}
export function createTrailLayer(scene: T.Scene) {
  const built = new Map<number, {group: T.Group; overlay: T.Line}>();
  let ghost: T.Group | undefined, exploring = false, selected: number | undefined;
  function visibility() {
    for (const [id, item] of built) {
      item.overlay.visible = !exploring || id === selected;
      (item.overlay.material as T.LineBasicMaterial).opacity = id === selected ? .94 : .58;
    }
  }
  return {
    add(map: Heightmap, trail: BuiltTrail) {
      const group = new T.Group(), color = trailColors[trail.difficulty];
      const overlay = line(trail.route, color, .58);
      group.add(ribbon(map, trail.route), signs(map,trail.route,color),overlay);
      scene.add(group);
      built.set(trail.id,{group, overlay});
      visibility();
    },
    remove(id: number) {
      const item = built.get(id);
      if (item) free(item.group);
      built.delete(id);
    },
    mode(explore: boolean) { exploring = explore; visibility(); },
    select(id?: number) { selected = id; visibility(); },
    draft(map: Heightmap, points: readonly GroundPoint[], plan?: TrailPlan) {
      if (ghost) free(ghost);
      ghost = undefined;
      if (!points.length) return;
      ghost = new T.Group();
      const route = plan?.route;
      if (route) {
        ghost.add(ribbon(map, route, true, Boolean(plan?.issues.length)));
        ghost.add(line(route, plan?.issues.length ? '#a24128' : '#165d46', .95));
      }
      const data: number[] = [];
      for (const p of [...points, ...(plan?.trees ?? [])]) data.push(p.x, map.sample(p.x,p.z).elevation + 3.6, p.z);
      const start = points[0];
      const marker = new T.Mesh(new T.RingGeometry(4.7,6.4,24), flag);
      const colors = new Float32Array(marker.geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) green.toArray(colors,i);
      marker.geometry.setAttribute('color',new T.BufferAttribute(colors,3));
      marker.rotation.x = -Math.PI/2;
      marker.position.set(start.x,map.sample(start.x,start.z).elevation+1.6,start.z);
      ghost.add(marker,new T.Points(positions(data),dots));
      scene.add(ghost);
    }
  };
}
