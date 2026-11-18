import * as T from 'three';
import type { GroundPoint } from '../lifts/alignment';
import type { Heightmap } from '../terrain';
import { entranceGate } from './entrance';

const colors = {wood:'#88513a', trim:'#24464a', snow:'#effafd', glass:'#9cc7c9',
  accent:'#e9aa64', slab:'#849da2', roof:'#405b60'};

export function entranceLayer(scene: T.Scene) {
  const group = new T.Group();
  scene.add(group);
  return {
    draw(map: Heightmap, location?: GroundPoint, draft = false, valid = true, routes: readonly (readonly GroundPoint[])[] = []) {
      for (const object of group.children) {
        const mesh = object as T.Mesh;
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
      }
      group.clear();
      if (!location) return;
      group.position.set(location.x,map.sample(location.x,location.z).elevation,location.z);
      const surface = (geometry: T.BufferGeometry, color: string, x: number,y: number,z: number) => {
        const material = new T.MeshStandardMaterial({color:draft && !valid?'#dc704d':color,roughness:.9,
          transparent:draft, opacity:draft ? .60 : 1});
        const object = new T.Mesh(geometry,material);
        object.position.set(x,y,z); group.add(object); return object;
      };
      const box = (w:number,h:number,d:number,c:string,x:number,y:number,z:number) =>
        surface(new T.BoxGeometry(w,h,d),c,x,y,z);
      box(17,3.6,15,colors.slab,0,-.7,0);
      box(15,5.8,12,colors.wood,0,3.8,-.6);
      box(15.2,1,12.1,colors.trim,0,1.3,-.6);
      for (const x of [-5.5,5.5]) {
        box(3,2.3,.18,colors.glass,x,4.1,5.48);
        box(.15,2.3,.20,colors.trim,x,4.1,5.61);
      }
      box(2.7,3.4,.22,colors.trim,0,2.8,5.51);
      box(2,1.4,.24,colors.glass,0,3.4,5.65);
      for (const side of [-1,1]) {
        for (const [height,color,width] of [[7.65,colors.roof,10.1],[8.02,colors.snow,9.9]] as const) {
          const roof = box(18,.46,width,color,0,height,side*4);
          roof.rotation.x = side*.34;
        }
        box(.36,3.2,.36,colors.trim,side*5.2,2.4,8.1);
      }
      box(12,.38,3.3,colors.snow,0,4,7.05);
      box(6,1.3,.2,colors.trim,0,5.68,5.61);
      const badge = surface(new T.ConeGeometry(.75,1.0,3),colors.accent,-2,5.7,5.84);
      badge.rotation.y = Math.PI/3;
      for (const x of [-.7,.35,1.4]) box(.63,.18,.10,colors.accent,x,5.75,5.80);
      const gate = entranceGate(location);
      box(7,.3,4,colors.slab,0,map.sample(gate.x,gate.z).elevation-group.position.y+.12,12);
      for (const path of routes) {
        const points: number[] = [];
        let start = gate;
        for (const end of path) {
          const steps = Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/3));
          for (let i=0; i<=steps; i++) {
            const x=start.x+(end.x-start.x)*i/steps, z=start.z+(end.z-start.z)*i/steps;
            points.push(x-location.x,map.sample(x,z).elevation-group.position.y+.8,z-location.z);
          }
          start = end;
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
        group.add(new T.Line(geometry,new T.LineBasicMaterial({color:draft?'#efb164':'#91c9bc',
          transparent:true,opacity:draft?.85:.48})));
      }
    }
  };
}
