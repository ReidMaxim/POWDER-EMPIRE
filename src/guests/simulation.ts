import { clampRating, demand, economy, hourlyCost, valuePrice } from '../business/economy.ts';
import { chairDistance, FIXED_GRIP, sampleLoop, wrapDistance, type ChairPose, type GroundPoint, type Point3 } from '../lifts/alignment.ts';
import type { createResort, OperatingLift } from '../lifts/resort.ts';
import type { Heightmap } from '../terrain.ts';
import { circuitStatus, findCircuits, lowerGate, queuePoint, suits, unloadFromEnd, unloadPoint, type Circuit, type Skill } from './routing.ts';
import { pedestrianPath, transferBudget } from '../trails/transfer.ts';

export type Activity = 'Arriving' | 'Queuing' | 'Boarding' | 'Riding' | 'Unloading' | 'To trail' | 'Skiing' | 'Returning' | 'Resting' | 'Leaving';
export interface Guest extends Point3 {
  id: number; skill: Skill; activity: Activity; yaw: number; speed: number; lean: number;
  destination?: GroundPoint; circuit: Circuit; leg: number; distance: number; station: number;
  ticket?: number; satisfaction: number; experience: string; queueTime: number;
  path?: readonly GroundPoint[]; pathIndex: number;
  chair: number; seat: number; age: number; runs: number; origin: Point3; routeIndex: number;
}
type Resort = ReturnType<typeof createResort>;
const pose: ChairPose = {x:0,y:0,z:0,yaw:0};
const colors = [0,1,0,1,2,0,1,2,1,0];
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
export function createGuestSimulation(map: Heightmap, resort: Resort, mode: 'sandbox' | 'opening-day' = 'sandbox') {
  const guests = new Map<number,Guest>();
  const queues = new Map<number,Guest[]>();
  const chairs = new Map<number, (Guest | undefined)[][]>();
  let circuits: Circuit[][] = [[],[],[]];
  let nextId = 1, arrival = 4.7, totalRuns = 0, circuitCount = 0;
  let limit: number = economy.guestCap.standard;
  const openingDay = mode === 'opening-day';
  const business = resort.business;
  let levels = 0, seatRate = 0, runningCost = 0;
  const occupiedClosingLifts = new Set<number>();
  let circuitHint = '';
  const queue = (id:number) => {
    let line = queues.get(id);
    if (!line) queues.set(id,line=[]);
    return line;
  };
  const set = (g:Guest, activity:Activity, target?: GroundPoint) => {
    g.activity=activity; g.age=0; g.destination=target; g.path=undefined; g.pathIndex=0; g.lean=0;
  };
  function release(g:Guest) {
    const places=chairs.get(g.circuit.lift.id)?.[g.chair];
    if (places?.[g.seat] === g) places[g.seat]=undefined;
    g.chair=-1;
  }
  const base = () => resort.routingAccess?.start ?? map.sites.base;
  const guestPath = (from: GroundPoint,to: GroundPoint,budget: number) => pedestrianPath(map,from,to,budget,resort.routingAccess?.obstacles);
  const receiving = () => !openingDay || business.data.phase === 'open';
  function experience(g: Guest, change: number, reason: string) {
    const rating = clampRating(g.satisfaction+change);
    if (g.ticket !== undefined) business.ratingChange(rating-g.satisfaction);
    g.satisfaction = rating;
    g.experience = reason;
  }
  function depart(g: Guest) {
    if (g.ticket !== undefined) business.departure();
    guests.delete(g.id);
  }
  function refresh() {
    circuits = [findCircuits(resort,map,0),findCircuits(resort,map,1),findCircuits(resort,map,2)];
    circuitCount = new Set(circuits.flat().map(c=>c.lift.id+':'+c.trails.map(t=>t.id).join('.'))).size;
    const all = circuits.flat();
    const served = new Map(all.map(c=>[c.lift.id,c.lift]));
    levels = new Set(all.flatMap(c=>c.trails.map(t=>t.difficulty))).size;
    seatRate = [...served.values()].reduce((sum,{alignment:a})=>sum+a.chairCount*FIXED_GRIP.speed*FIXED_GRIP.passengers/a.loopLength,0);
    runningCost = [...resort.lifts.values()].reduce((sum,lift)=>sum+(lift.running?hourlyCost(lift.alignment):0),0);
    if (!circuitCount) {
      const trail = [...resort.trails.values()].find(t => t.open && t.connections.reachableUpperLiftIds.length)
        ?? resort.trails.values().next().value;
      circuitHint = trail ? circuitStatus(resort,map,trail) : 'Build a lift and a downhill run to create a guest circuit.';
    }
  }
  refresh();

  function transfer(g: Guest, activity: Activity, path: readonly GroundPoint[]) {
    set(g,activity);
    g.path = path;
  }
  function leave(g: Guest, path = guestPath(g,base(),transferBudget.base)) {
    if (path) transfer(g,'Leaving',path);
    else recover(g);
  }
  function arrive(): boolean {
    if (guests.size>=limit || !receiving() || (openingDay && (!business.data.entrance || business.data.arrivalCredit < 1))) return false;
    const preferred=colors[(nextId-1)%colors.length] as Skill;
    const available = circuits[preferred].length ? preferred : ([1,2,0] as Skill[]).find(skill=>circuits[skill].length);
    if (available===undefined) return false;
    const options=circuits[available];
    const load = new Map<number,number>();
    if (openingDay) for (const guest of guests.values()) {
      if (guest.activity !== 'Leaving') load.set(guest.station,(load.get(guest.station) ?? 0)+1);
    }
    const liftLoad = (id: number) => openingDay ? (load.get(id) ?? 0)+queue(id).length : queue(id).length;
    const trip = options.reduce((a,b)=>liftLoad(a.lift.id) <= liftLoad(b.lift.id) ? a : b);
    if (queue(trip.lift.id).length>=economy.maxQueue) return false;
    const {x,z}=base();
    const ticket = openingDay ? business.data.price : undefined;
    const premium = Math.max(0,(ticket ?? 0)-valuePrice(circuitCount,levels));
    const satisfaction = clampRating(economy.initialSatisfaction-premium*economy.costlyTicketPenalty);
    if (openingDay && !business.sell(satisfaction)) return false;
    const g:Guest={x,z,y:map.sample(x,z).elevation,id:nextId++,skill:available,activity:'Arriving',yaw:0,speed:0,lean:0,
      circuit:trip,leg:0,distance:0,station:trip.lift.id,chair:-1,seat:0,age:0,runs:0,origin:{x,y:0,z},routeIndex:0,
      path:trip.arrival,pathIndex:0,ticket,queueTime:0,
      satisfaction,
      experience:premium ? 'Ticket felt expensive for the available skiing' : 'Suitable skiing for the ticket price'};
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
    return d <= Math.max(.01, dt*walkSpeed) && g.y-y<.14;
  }
  function followPath(g: Guest, dt: number) {
    const target = g.path?.[g.pathIndex];
    if (target && walk(g,target,dt)) g.pathIndex++;
    return g.pathIndex >= (g.path?.length ?? 0);
  }
  function recover(g:Guest) {
    release(g);
    // A removed chair has no pose to follow. Settle in place before retiring the guest.
    set(g,'Resting');
  }
  function toTrail(g:Guest) {
    const trail=g.circuit.trails[g.leg];
    if (trail && g.circuit.trails.slice(g.leg).every(t=>resort.trails.has(t.id)&&suits(t,g.skill))) {
      transfer(g,'To trail',g.circuit.transfers[g.leg]);
      return;
    }
    if (g.leg===0) {
      const alternate=circuits[g.skill].find(route=>route.lift.id===g.circuit.lift.id);
      const path = alternate && guestPath(g,alternate.trails[0].route.samples[0],transferBudget.terminal);
      if (alternate && path) {g.circuit=alternate;transfer(g,'To trail',path);return;}
    }
    experience(g,-8,'No suitable open trail after unloading');
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
      experience(g,economy.runReward,'Completed a suitable ski run');
      if (g.ticket !== undefined) business.completedRun();
      g.leg++;
      if(g.leg<g.circuit.trails.length) toTrail(g);
      else transfer(g,'Returning',g.circuit.returnPath);
    }
  }
  function updateGuest(g:Guest,dt:number) {
    g.age+=dt;
    const lift=resort.lifts.get(g.circuit.lift.id);
    switch(g.activity) {
      case 'Arriving': {
        if (!receiving() || !lift?.running || !circuits[g.skill].some(c=>c.lift.id===lift.id)) {leave(g);break;}
        const line=queue(lift.id);
        if(followPath(g,dt) && line.length<economy.maxQueue) {
          if (openingDay && !g.runs && g.age>economy.longApproachSeconds) {
            experience(g,-economy.longApproachPenalty,'Long walk from the entrance to the lift');
          }
          line.push(g);set(g,'Queuing');
        }
        break;
      }
      case 'Queuing': {
        const line=queue(g.station);
        const index=line.indexOf(g);
        if(!receiving() || !lift?.running || !circuits[g.skill].some(c=>c.lift.id===lift.id)) {
          if (receiving()) experience(g,-8,'Lift or ski circuit became unavailable');
          if(index>=0) line.splice(index,1);
          leave(g);
        } else if(index>=0) {
          g.queueTime += dt;
          if (g.queueTime > economy.goodQueueSeconds) experience(g,-economy.queuePenaltyRate*dt,'Long lift queue');
          g.destination=queuePoint(g.circuit.lift.alignment,index);
          walk(g,g.destination,dt);
        }
        break;
      }
      case 'Boarding':
      case 'Riding':
        if(!lift){recover(g);break;}
        if (!lift.running) experience(g,-economy.blockedPenaltyRate*dt,'Waiting for a stopped lift');
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
        if(followPath(g,dt)) {
          const trail=g.circuit.trails[g.leg];
          if(!resort.trails.has(trail.id)||!suits(trail,g.skill)) {toTrail(g);break;}
          g.distance=0;g.routeIndex=0;g.speed=2;set(g,'Skiing');
        }
        break;
      case 'Skiing': ski(g,dt);break;
      case 'Returning':
        if(followPath(g,dt)) {
          const route = circuits[g.skill].find(c=>c.lift.id===g.circuit.exitLift) ??
            (g.circuit.exitLift === undefined ? circuits[g.skill][0] : undefined);
          if (receiving() && route && g.runs < (openingDay ? economy.maxRunsPerVisit : 4)) {
            const path = g.circuit.exitLift === undefined ? route.arrival : [];
            g.circuit=route;g.station=route.lift.id;g.leg=0;transfer(g,'Arriving',path);
          } else leave(g,g.circuit.departure);
        }
        break;
      case 'Leaving':
        if(followPath(g,dt)) depart(g);
        break;
      case 'Resting':
        g.speed=0;walk(g,g,dt,true);
        if(g.age>5) {
          const home = guestPath(g,base(),transferBudget.base);
          if(home) leave(g,home);
          else depart(g);
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
          set(g,'Unloading',unloadPoint(alignment));
        }
      }
      if(line?.length && crossesGate(previous,travel,lowerGate,alignment.loopLength)){
        for(let seat=0;seat<FIXED_GRIP.passengers;seat++){
          const g=line[0];if(!g || slots[seat])break;
          const at=queuePoint(alignment);
          if(Math.hypot(g.x-at.x,g.z-at.z)>3.5)break;
          const available = circuits[g.skill].filter(route=>route.lift.id===lift.id);
          const current = available[(g.id + g.runs - 1) % available.length];
          if(!current){line.shift();leave(g);continue;}
          line.shift();slots[seat]=g;g.chair=i;g.seat=seat;g.circuit=current;g.leg=0;
          g.origin.x=g.x;g.origin.y=g.y;g.origin.z=g.z;
          if (g.queueTime <= economy.goodQueueSeconds) experience(g,2,'Short lift queue');
          g.queueTime = 0;
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
      if (openingDay) {
        const {price,reputation} = business.data;
        let billedCost = runningCost;
        if (!receiving()) {
          occupiedClosingLifts.clear();
          for (const guest of guests.values()) if (guest.chair >= 0) occupiedClosingLifts.add(guest.circuit.lift.id);
          billedCost = 0;
          for (const id of occupiedClosingLifts) {
            const lift = resort.lifts.get(id);
            if (lift?.running) billedCost += hourlyCost(lift.alignment);
          }
        }
        business.advance(dt,billedCost,guests.size,demand(price,circuitCount,levels,reputation,seatRate));
        arrive();
      } else {
        arrival+=dt;
        if(arrival>=5){arrival=0;arrive();}
      }
    },
    stats(){
      let waiting=0,riding=0,skiing=0;
      for(const g of guests.values()){
        if(g.activity==='Queuing')waiting++;
        if(g.activity==='Riding'||g.activity==='Boarding')riding++;
        if(g.activity==='Skiing')skiing++;
      }
      return {guests:guests.size,waiting,riding,skiing,runs:totalRuns,
        circuits:circuitCount, circuitHint};
    }
  };
}
