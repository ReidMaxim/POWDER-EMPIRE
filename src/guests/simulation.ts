import { chairDistance, FIXED_GRIP, sampleLoop, wrapDistance, type ChairPose, type GroundPoint, type Point3 } from '../lifts/alignment.ts';
import type { createResort, OperatingLift } from '../lifts/resort.ts';
import type { Heightmap } from '../terrain.ts';
import { findCircuits, suits, walkable, type Circuit, type Skill } from './routing.ts';

export type Activity = 'Arriving' | 'Queuing' | 'Boarding' | 'Riding' | 'Unloading' | 'To trail' | 'Skiing' | 'Returning' | 'Resting' | 'Leaving';
export interface Guest extends Point3 {
  id: number; skill: Skill; activity: Activity; yaw: number; speed: number; lean: number;
  destination?: GroundPoint; circuit: Circuit; leg: number; distance: number; station: number;
  chair: number; seat: number; age: number; runs: number; origin: Point3; routeIndex: number;
}
type Resort = ReturnType<typeof createResort>;
const pose: ChairPose = {x:0,y:0,z:0,yaw:0};
const colors = [0,1,0,1,2,0,1,2,1,0];
const lowerGate = 7, unloadFromEnd = 8;
const platformOffset = 5.1;
const boardingSeconds = .8;
const walkSpeed = 4.6;
const satHeight = 4.62;
const speeds = [8,11.5,15];

export function liftSeat(lift: OperatingLift, chair: number, seat: number, out: ChairPose) {
  sampleLoop(lift.alignment, chairDistance(lift.alignment,lift.phase,chair),out);
  const side = (seat === 0 ? -.85 : .85);
  out.x += Math.cos(out.yaw)*side;
  out.z -= Math.sin(out.yaw)*side;
  out.y -= satHeight;
}

/** Crossing is evaluated against the same advancing loop distances used by the renderer. */
export function crossesGate(previous: number, distance: number, gate: number, loop: number) {
  const remaining = wrapDistance(gate-previous,loop);
  return remaining > 1e-8 && remaining <= distance + 1e-8;
}
export function createGuestSimulation(map: Heightmap, resort: Resort) {
  const guests = new Map<number,Guest>();
  const queues = new Map<number,Guest[]>();
  const chairs = new Map<number, (Guest | undefined)[][]>();
  let circuits: Circuit[][] = [[],[],[]];
  let nextId = 1, arrival = 4.7, totalRuns = 0, circuitCount = 0;
  let limit = 24;
  const queue = (id:number) => {
    let line = queues.get(id);
    if (!line) queues.set(id,line=[]);
    return line;
  };
  const set = (g:Guest, activity:Activity, target?: GroundPoint) => {
    g.activity=activity; g.age=0; g.destination=target; g.lean=0;
  };
  function release(g:Guest) {
    const places=chairs.get(g.circuit.lift.id)?.[g.chair];
    if (places?.[g.seat] === g) places[g.seat]=undefined;
    g.chair=-1;
  }
  const base = map.sites.base;
  function refresh() {
    circuits = [findCircuits(resort,map,0),findCircuits(resort,map,1),findCircuits(resort,map,2)];
    circuitCount = new Set(circuits.flat().map(c=>c.lift.id+':'+c.trails.map(t=>t.id).join('.'))).size;
  }
  refresh();

  function queueTarget(g:Guest, index:number) {
    const l=g.circuit.lift.alignment;
    const offset=lowerGate-2-index*2.45, side=l.turnRadius+platformOffset;
    return {x:l.lower.x+l.ux*offset-l.uz*side,z:l.lower.z+l.uz*offset+l.ux*side};
  }
  function arrive(): boolean {
    if (guests.size>=limit) return false;
    const preferred=colors[(nextId-1)%colors.length] as Skill;
    const available = circuits[preferred].length ? preferred : ([1,2,0] as Skill[]).find(skill=>circuits[skill].length);
    if (available===undefined) return false;
    const options=circuits[available];
    const trip=options.reduce((a,b)=>queue(a.lift.id).length <= queue(b.lift.id).length ? a : b);
    if (queue(trip.lift.id).length>=12) return false;
    const angle=nextId*2.4, x=base.x+Math.cos(angle)*5, z=base.z+Math.sin(angle)*5;
    const g:Guest={x,z,y:map.sample(x,z).elevation,id:nextId++,skill:available,activity:'Arriving',yaw:0,speed:0,lean:0,
      circuit:trip,leg:0,distance:0,station:trip.lift.id,chair:-1,seat:0,age:0,runs:0,origin:{x,y:0,z},routeIndex:0};
    guests.set(g.id,g);
    return true;
  }
  function walk(g:Guest,target:GroundPoint,dt:number,settle=false) {
    const dx=target.x-g.x,dz=target.z-g.z,d=Math.hypot(dx,dz);
    if (d>.01) {
      const t=Math.min(1,dt*walkSpeed/d);
      g.x+=dx*t; g.z+=dz*t;
      g.yaw=Math.atan2(dx,dz);
    }
    const y=map.sample(g.x,g.z).elevation;
    g.y=settle ? Math.max(y,g.y-Math.max(4,(g.y-y)*3)*dt) : y;
    g.speed=d>.15 ? walkSpeed : 0;
    return d<.22 && g.y-y<.14;
  }
  function recover(g:Guest) {
    release(g);
    // A removed chair has no pose to follow. Settle in place before retiring the guest.
    set(g,'Resting');
  }
  function toTrail(g:Guest) {
    const trail=g.circuit.trails[g.leg];
    if (trail && g.circuit.trails.slice(g.leg).every(t=>resort.trails.has(t.id)&&suits(t,g.skill))) {
      const start=trail.route.samples[0];
      if (walkable(map,g,start)) {set(g,'To trail',start);return;}
    }
    if (g.leg===0) {
      const alternate=circuits[g.skill].find(route=>route.lift.id===g.circuit.lift.id && walkable(map,g,route.trails[0].route.samples[0]));
      if(alternate){g.circuit=alternate;set(g,'To trail',alternate.trails[0].route.samples[0]);return;}
    }
    recover(g);
  }
  function ski(g:Guest,dt:number) {
    const trail=g.circuit.trails[g.leg];
    if (!resort.trails.has(trail.id)) { recover(g); return; }
    const route=trail.route, samples=route.samples;
    const remaining=route.length-g.distance, p=samples[g.routeIndex];
    const target=Math.min(speeds[g.skill]*(.64+Math.min(.5,Math.max(0,p.grade)/75)),2.4+remaining*.62);
    g.speed+=(target-g.speed)*Math.min(1,dt*2.1);
    g.distance=Math.min(route.length,g.distance+g.speed*dt);
    while(g.routeIndex+1<samples.length-1 && samples[g.routeIndex+1].distance<g.distance) g.routeIndex++;
    const a=samples[g.routeIndex],b=samples[g.routeIndex+1];
    const ratio=(g.distance-a.distance)/(b.distance-a.distance), dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
    const wave=g.distance/(g.skill===0?6.8:4.8)+g.id*.92;
    const amplitude=Math.min(route.width*.23,g.skill===0?3.2:2.3)*Math.min(1,g.distance/12,(route.length-g.distance)/12);
    const side=Math.sin(wave)*amplitude;
    g.x=a.x+dx*ratio-dz/d*side;g.z=a.z+dz*ratio+dx/d*side;
    g.y=map.sample(g.x,g.z).elevation;
    g.yaw=Math.atan2(dx,dz)-Math.cos(wave)*.28;
    g.lean=Math.cos(wave)*.24;
    if(g.distance>=route.length) {
      g.runs++;totalRuns++;
      g.leg++;
      if(g.leg<g.circuit.trails.length) toTrail(g);
      else set(g,'Returning',g.circuit.exit);
    }
  }
  function updateGuest(g:Guest,dt:number) {
    g.age+=dt;
    const lift=resort.lifts.get(g.circuit.lift.id);
    switch(g.activity) {
      case 'Arriving': {
        if (!lift?.running || !circuits[g.skill].some(c=>c.lift.id===lift.id)) {set(g,'Leaving',base);break;}
        const line=queue(lift.id);
        g.destination=queueTarget(g,Math.min(line.length,11));
        if(walk(g,g.destination,dt) && line.length<12){line.push(g);set(g,'Queuing');}
        break;
      }
      case 'Queuing': {
        const line=queue(g.station);
        const index=line.indexOf(g);
        if(!lift?.running || !circuits[g.skill].some(c=>c.lift.id===lift.id)) {
          if(index>=0) line.splice(index,1);
          set(g,'Leaving',base);
        } else if(index>=0) {
          g.destination=queueTarget(g,index);
          walk(g,g.destination,dt);
        }
        break;
      }
      case 'Boarding':
      case 'Riding':
        if(!lift){recover(g);break;}
        liftSeat(lift,g.chair,g.seat,pose);
        if(g.activity==='Boarding' && !lift.running){g.age-=dt;break;}
        {
          const t=g.activity==='Riding'?1:Math.min(1,g.age/boardingSeconds);
          const ease=t*t*(3-2*t);
          g.x=g.origin.x+(pose.x-g.origin.x)*ease;
          // Step up toward the loading deck before sliding inward onto the seat.
          const rise=1-(1-t)*(1-t);
          g.y=g.origin.y+(pose.y-g.origin.y)*rise;
          g.z=g.origin.z+(pose.z-g.origin.z)*ease;g.yaw=pose.yaw;g.speed=0;
          if(t===1&&g.activity==='Boarding') set(g,'Riding');
        }
        break;
      case 'Unloading':
        if(g.destination && walk(g,g.destination,dt,true)) toTrail(g);
        break;
      case 'To trail':
        if(g.destination && walk(g,g.destination,dt)) {
          const trail=g.circuit.trails[g.leg];
          if(!resort.trails.has(trail.id)||!suits(trail,g.skill)) {toTrail(g);break;}
          g.distance=0;g.routeIndex=0;g.speed=2;set(g,'Skiing');
        }
        break;
      case 'Skiing': ski(g,dt);break;
      case 'Returning':
        if(g.destination && walk(g,g.destination,dt)) {
          const route=circuits[g.skill].find(c=>c.lift.id===g.circuit.exitLift) ?? circuits[g.skill][0];
          if(route && g.runs<4 && walkable(map,g,route.lift.alignment.lower)) {
            g.circuit=route;g.station=route.lift.id;g.leg=0;set(g,'Arriving');
          } else set(g,'Leaving',base);
        }
        break;
      case 'Leaving':
        if(walk(g,base,dt,true)) guests.delete(g.id);
        break;
      case 'Resting':
        g.speed=0;walk(g,g,dt,true);
        if(g.age>5) {
          if(walkable(map,g,base)) set(g,'Leaving',base);
          else guests.delete(g.id);
        }
        break;
    }
  }

  function processLift(lift:OperatingLift, travel:number) {
    if(!lift.running || travel<=0) return;
    const line=queues.get(lift.id), alignment=lift.alignment;
    let seats=chairs.get(lift.id);
    if (!seats && line?.length) chairs.set(lift.id,seats=Array.from({length:alignment.chairCount},()=>[]));
    if (!seats) return;
    for(let i=0;i<alignment.chairCount;i++){
      const slots=seats[i], previous=chairDistance(alignment,lift.phase,i)-travel;
      if(crossesGate(previous,travel,alignment.uphillLength-unloadFromEnd,alignment.loopLength)) {
        for(let seat=0;seat<FIXED_GRIP.passengers;seat++){
          const g=slots[seat];if(!g)continue;
          liftSeat(lift,i,seat,pose);
          g.x=pose.x;g.y=pose.y;g.z=pose.z;g.yaw=pose.yaw;
          release(g);
          const a=alignment.upper;
          set(g,'Unloading',{x:a.x-alignment.uz*(alignment.turnRadius+platformOffset)+alignment.ux*3,
            z:a.z+alignment.ux*(alignment.turnRadius+platformOffset)+alignment.uz*3});
        }
      }
      if(line?.length && crossesGate(previous,travel,lowerGate,alignment.loopLength)){
        for(let seat=0;seat<FIXED_GRIP.passengers;seat++){
          const g=line[0];if(!g || slots[seat])break;
          const at=queueTarget(g,0);
          if(Math.hypot(g.x-at.x,g.z-at.z)>3.5)break;
          const current=circuits[g.skill].find(route=>route.lift.id===lift.id);
          if(!current){line.shift();set(g,'Leaving',base);continue;}
          line.shift();slots[seat]=g;g.chair=i;g.seat=seat;g.circuit=current;g.leg=0;
          g.origin.x=g.x;g.origin.y=g.y;g.origin.z=g.z;
          set(g,'Boarding');
        }
      }
    }
  }
  return {
    guests,refresh,
    setLimit(n:number){limit=n;},
    advance(dt:number) {
      resort.advance(dt);
      for(const guest of guests.values()) updateGuest(guest,dt);
      for(const lift of resort.lifts.values()) processLift(lift,dt*FIXED_GRIP.speed);
      for(const id of chairs.keys()) if(!resort.lifts.has(id))chairs.delete(id);
      for(const id of queues.keys()) if(!resort.lifts.has(id))queues.delete(id);
      arrival+=dt;
      if(arrival>=5){arrival=0;arrive();}
    },
    stats(){
      let waiting=0,riding=0,skiing=0;
      for(const g of guests.values()){
        if(g.activity==='Queuing')waiting++;
        if(g.activity==='Riding'||g.activity==='Boarding')riding++;
        if(g.activity==='Skiing')skiing++;
      }
      return {guests:guests.size,waiting,riding,skiing,runs:totalRuns,
        circuits:circuitCount};
    }
  };
}
