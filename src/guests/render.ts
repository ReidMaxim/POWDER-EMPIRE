import * as T from 'three';
import type { Guest } from './simulation';

const max = 32;
const cloth = new T.MeshStandardMaterial({roughness: .86});
const palette = ['#f09a35','#cf4257','#3ebdcc','#83bd50','#a677d9','#e2ad3e'].map(color=>new T.Color(color));
const dark = new T.Color('#203741'), snow = new T.Color('#f1ded0'), ski = new T.Color('#164b60');

export function createGuestLayer(scene:T.Scene) {
  const group = new T.Group();
  const box = new T.BoxGeometry(1,1,1);
  const round = new T.IcosahedronGeometry(.5,1);
  const parts = Array.from({length:9},(_,i)=>{
    const mesh=new T.InstancedMesh(i===1?round:box,cloth,max);
    mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.setColorAt(0,dark);
    mesh.count=0;
    mesh.visible=false;
    group.add(mesh);
    return mesh;
  });
  const ring=new T.Mesh(new T.RingGeometry(1.9,2.22,24),new T.MeshBasicMaterial({color:'#ffb875',side:T.DoubleSide,depthTest:false}));
  ring.rotation.x=-Math.PI/2;
  ring.renderOrder=12;
  ring.visible=false;
  group.add(ring);
  const parent=new T.Object3D(), local=new T.Object3D(), combined=new T.Matrix4();
  const point=new T.Vector3();
  scene.add(group);
  let picked:number|undefined;
  return {
    select(id?:number){picked=id;},
    update(guests: Iterable<Guest>, time:number) {
      let index=0;ring.visible=false;
      for(const g of guests){
        if(index===max)break;
        if(picked===g.id){ring.visible=true;ring.position.set(g.x,g.y+.35,g.z);}
        const seated=g.activity==='Riding'||g.activity==='Boarding';
        const skiing=g.activity==='Skiing';
        const gait=!skiing&&!seated&&g.speed>1?Math.sin(time*7+g.id)*.43:0;
        const jacket=palette[g.id%palette.length];
        parent.position.set(g.x,g.y,g.z);
        parent.rotation.set(0,g.yaw,g.lean,'YXZ');parent.updateMatrix();
        const part=(i:number,x:number,y:number,z:number,w:number,h:number,d:number,pitch:number,color:T.Color)=>{
          local.position.set(x,y,z);local.scale.set(w,h,d);local.rotation.set(pitch,0,0);
          local.updateMatrix();combined.multiplyMatrices(parent.matrix,local.matrix);
          parts[i].setMatrixAt(index,combined);parts[i].setColorAt(index,color);
        };
        const h=seated?0:skiing?1.25:1.53;
        part(0,0,h+.55,0,1.03,1.13,.63,skiing?.22:0,jacket);
        part(1,0,h+1.53,.01,.92,.95,.95,0,dark);
        part(2,0,h+1.48,.41,.60,.19,.18,0,snow);
        for(let i=0;i<2;i++){
          const side=i===0?-1:1;
          part(3+i,side*.66,h+.48,seated?.37:.15,.34,.95,.35,seated?-1.2:.35+side*gait,jacket);
          part(5+i,side*.29,seated?-.55:.68,seated?.57:side*gait*.5,.42,1.24,.43,seated?.57:-side*gait,dark);
          part(7+i,side*.31,seated?-1.21:.12,seated?.82:.22+side*gait,.24,.12,2.8,seated?-.14:0,ski);
        }
        index++;
      }
      for(const mesh of parts){
        mesh.visible=index>0;
        mesh.count=index;mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      }
    },
    pick(guests:Iterable<Guest>,camera:T.Camera,x:number,y:number,width:number,height:number,ray:T.Ray,terrainDistance:number) {
      let match:Guest|undefined, nearest=19;
      for(const g of guests){
        point.set(g.x,g.y+1.4,g.z);
        if(ray.origin.distanceTo(point)>terrainDistance+5)continue;
        point.project(camera);
        if(point.z<-1||point.z>1)continue;
        const distance=Math.hypot((point.x+1)*width/2-x,(1-point.y)*height/2-y);
        if(distance<nearest){nearest=distance;match=g;}
      }
      return match;
    }
  };
}
