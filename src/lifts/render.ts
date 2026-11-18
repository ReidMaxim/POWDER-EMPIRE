import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Heightmap } from '../terrain.ts';
import { chairDistance, FIXED_GRIP, sampleLoop, type ChairPose, type GroundPoint, type LiftAlignment, type Point3 } from './alignment.ts';
import type { OperatingLift } from './resort.ts';

const box = new T.BoxGeometry(1, 1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 10);
const wheel = new T.TorusGeometry(FIXED_GRIP.turnRadius - .42, .42, 5, 24);
const up = new T.Vector3(0, 1, 0);
const palette = ['#24454c', '#e78e47', '#a7bdc1', '#27353b', '#8ad5dd'];
const normal = palette.map(color => new T.MeshStandardMaterial({ color, roughness: .77 }));
const selected = new T.MeshBasicMaterial({ color: '#ffb475', side: T.DoubleSide });
const picking = new T.MeshBasicMaterial({ visible: false });

class Parts {
  private readonly groups = new Map<number, T.BufferGeometry[]>();
  private readonly transform = new T.Object3D();
  part(kind: number, template: T.BufferGeometry, position: Point3, x: number, y: number, z: number, yaw = 0, tilt = 0) {
    this.transform.position.set(position.x, position.y, position.z);
    this.transform.scale.set(x, y, z);
    this.transform.rotation.set(tilt, yaw, 0, 'YXZ');
    this.add(kind, template);
  }
  beam(kind: number, a: Point3, b: Point3, radius: number) {
    const axis = new T.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    if (axis.lengthSq() < 1e-12) return;
    this.transform.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.transform.scale.set(radius, axis.length(), radius);
    this.transform.quaternion.setFromUnitVectors(up, axis.normalize());
    this.add(kind, cylinder);
  }
  private add(kind: number, template: T.BufferGeometry) {
    this.transform.updateMatrix();
    const geometry = template.clone().applyMatrix4(this.transform.matrix);
    let parts = this.groups.get(kind);
    if (!parts) this.groups.set(kind, parts = []);
    parts.push(geometry);
  }
  meshes(materials: T.Material[]) {
    return [...this.groups].map(([kind, parts]) => {
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      return new T.Mesh(geometry, materials[kind]);
    });
  }
}

function station(parts: Parts, center: Point3, yaw: number) {
  const local = (x: number, y: number, z: number) => ({
    x: center.x + Math.cos(yaw) * x + Math.sin(yaw) * z,
    y: center.y + y,
    z: center.z - Math.sin(yaw) * x + Math.cos(yaw) * z
  });
  const add = (kind: number, x: number, y: number, z: number, w: number, h: number, d: number) =>
    parts.part(kind, box, local(x, y, z), w, h, d, yaw);
  add(2, 0, .6, -.5, 14.5, 3.4, 16);
  add(0, 0, 3.25, -.5, 14.8, .65, 16.2);
  add(0, 0, 7, 1.5, 4.8, 7.1, 6.5);
  add(4, 0, 7.8, 4.8, 3.7, 2.3, .22);
  add(1, 0, 10.55, 1.4, 6.2, .8, 8.4);
  for (const side of [-1, 1]) {
    add(2, side * 6.2, 7.5, -4.6, .75, 8.2, .75);
    add(1, side * 6.3, 11.3, -2.1, 1.0, .8, 7.8);
  }
  const height = FIXED_GRIP.cableHeight;
  parts.part(1, wheel, local(0, height - .34, 0), 1, 1, 1, yaw, Math.PI / 2);
  parts.part(3, cylinder, local(0, height - .32, 0), 1.35, .45, 1.35);
  for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
    parts.part(2, box, local(0, height - .35, 0), 8.2, .28, .52, angle);
  }
}

function structure(map: Heightmap, lift: LiftAlignment, parts: Parts) {
  const yaw = Math.atan2(lift.ux, lift.uz);
  station(parts, lift.lower, yaw);
  station(parts, lift.upper, yaw + Math.PI);
  for (const top of lift.towers) {
    const ground = map.sample(top.x, top.z).elevation;
    const h = top.y - ground;
    parts.part(2, box, { ...top, y: ground + .15 }, 4.4, 2.4, 4.4, yaw);
    parts.part(0, cylinder, { ...top, y: ground + h / 2 - .35 }, .85, h, .85);
    parts.part(2, box, { ...top, y: top.y - .85 }, 11.3, .74, 1.25, yaw);
    for (const side of [-1, 1]) {
      const x = top.x - lift.uz * lift.turnRadius * side, z = top.z + lift.ux * lift.turnRadius * side;
      parts.part(1, box, { x, y: top.y - .36, z }, 1.9, .82, 3.9, yaw);
      parts.beam(0, { ...top, y: top.y - 4.5 }, { x, y: top.y - 1, z }, .27);
    }
  }
  const ringLength = Math.PI * lift.turnRadius;
  const lengths = [
    ...lift.cumulative,
    ...Array.from({ length: 16 }, (_, i) => lift.uphillLength + ringLength * (i + 1) / 16),
    ...lift.cumulative.slice(0, -1).reverse().map(d => lift.uphillLength * 2 + ringLength - d),
    ...Array.from({ length: 16 }, (_, i) => lift.uphillLength * 2 + ringLength * (1 + (i + 1) / 16))
  ];
  const a: ChairPose = { x: 0, y: 0, z: 0, yaw: 0 }, b = { ...a };
  sampleLoop(lift, lengths[0], a);
  for (const d of lengths.slice(1)) {
    sampleLoop(lift, d, b);
    parts.beam(3, a, b, .30);
    Object.assign(a, b);
  }
}

function chairs(count: number) {
  const parts = new Parts();
  const add = (kind: number, x: number, y: number, z: number, width: number, height: number, depth: number) =>
    parts.part(kind, box, { x, y, z }, width, height, depth);
  add(3, 0, -1.8, 0, .31, 3.6, .31);
  add(3, 0, -3.45, -.48, 3.45, .21, .24);
  add(1, 0, -4.85, 0, 3.64, .42, 1.68);
  add(0, 0, -4.16, -.78, 3.64, 1.35, .29);
  for (const side of [-1, 1]) {
    add(2, side * 1.65, -4.08, -.57, .22, 1.7, .24);
    add(3, side * 1.58, -4.43, .40, .22, .19, 1.25);
  }
  return parts.meshes(normal).map(mesh => {
    const instances = new T.InstancedMesh(mesh.geometry, mesh.material, count);
    instances.instanceMatrix.setUsage(T.DynamicDrawUsage);
    instances.frustumCulled = false;
    return instances;
  });
}

const disposeGroup = (group: T.Group) => {
  group.removeFromParent();
  group.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    if (object instanceof T.InstancedMesh) object.dispose();
    object.geometry.dispose();
  });
};

export function createLiftLayer(scene: T.Scene) {
  const visuals = new Map<number, { group: T.Group; markers: T.Object3D[]; chairs: T.InstancedMesh[] }>();
  const pickables: T.Mesh[] = [];
  const instance = new T.Object3D();
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  let ghost: T.Group | undefined;
  let ghostMaterials: T.Material[] = [];

  function syncChairs(lift: OperatingLift, components: T.InstancedMesh[]) {
    for (let i = 0; i < lift.alignment.chairCount; i++) {
      sampleLoop(lift.alignment, chairDistance(lift.alignment, lift.phase, i), pose);
      instance.position.set(pose.x, pose.y, pose.z);
      instance.rotation.y = pose.yaw;
      instance.updateMatrix();
      for (const mesh of components) mesh.setMatrixAt(i, instance.matrix);
    }
    for (const mesh of components) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    pickables,
    add(map: Heightmap, record: OperatingLift) {
      const parts = new Parts();
      const plan = record.alignment;
      structure(map, plan, parts);
      const group = new T.Group();
      const seats = chairs(plan.chairCount);
      group.add(...parts.meshes(normal), ...seats);
      const markers = [plan.lower, plan.upper].map(point => {
        const ring = new T.Mesh(new T.RingGeometry(9, 10.7, 24), selected);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(point.x, point.y + 3.5, point.z);
        ring.visible = false;
        group.add(ring);
        return ring;
      });
      for (const at of [...plan.towers, plan.lower, plan.upper]) {
        const terminal = at === plan.lower || at === plan.upper;
        const ground = map.sample(at.x, at.z).elevation;
        const height = terminal ? 14 : at.y - ground;
        const proxy = new T.Mesh(new T.BoxGeometry(terminal ? 19 : 7, height, terminal ? 19 : 7), picking);
        proxy.position.set(at.x, ground + height / 2, at.z);
        proxy.userData.liftId = record.id;
        pickables.push(proxy);
        group.add(proxy);
      }
      scene.add(group);
      group.updateMatrixWorld(true);
      visuals.set(record.id, { group, markers, chairs: seats });
      syncChairs(record, seats);
    },
    remove(id: number) {
      const visual = visuals.get(id);
      if (!visual) return;
      for (let i = pickables.length - 1; i >= 0; i--) {
        if (pickables[i].userData.liftId === id) pickables.splice(i, 1);
      }
      disposeGroup(visual.group);
      visuals.delete(id);
    },
    select(id?: number) {
      for (const [key, visual] of visuals) visual.markers.forEach(marker => { marker.visible = key === id; });
    },
    animate(lifts: Iterable<OperatingLift>) {
      for (const lift of lifts) {
        const visual = visuals.get(lift.id);
        if (visual && lift.running) syncChairs(lift, visual.chairs);
      }
    },
    preview(map: Heightmap, lower?: GroundPoint, upper?: GroundPoint, alignment?: LiftAlignment, valid = true) {
      if (ghost) disposeGroup(ghost);
      ghostMaterials.forEach(material => material.dispose());
      ghost = undefined;
      ghostMaterials = [];
      if (!lower) return;
      const parts = new Parts();
      const at = { ...lower, y: map.sample(lower.x, lower.z).elevation };
      if (alignment) structure(map, alignment, parts);
      else {
        const to = upper && { ...upper, y: map.sample(upper.x, upper.z).elevation };
        const yaw = to ? Math.atan2(to.x - at.x, to.z - at.z) : 0;
        station(parts, at, yaw);
        if (to) {
          station(parts, to, yaw + Math.PI);
          parts.beam(3, { ...at, y: at.y + 12 }, { ...to, y: to.y + 12 }, .44);
        }
      }
      ghostMaterials = palette.map((_, kind) => new T.MeshBasicMaterial({
        color: valid ? (kind === 3 ? '#9e4d23' : '#df7a38') : '#b33945',
        opacity: kind === 3 ? .84 : .62,
        transparent: true, depthWrite: false
      }));
      ghost = new T.Group();
      ghost.add(...parts.meshes(ghostMaterials));
      scene.add(ghost);
    }
  };
}
