import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateTerrain } from '../src/terrain.ts';
import { createResort, freshResort } from '../src/lifts/resort.ts';
import { crossesGate, createGuestSimulation, liftSeat } from '../src/guests/simulation.ts';
import { findCircuits } from '../src/guests/routing.ts';

function fixture() {
  const map=generateTerrain('FROST-001'), resort=createResort(map,freshResort(map.seed));
  const {upper,base}=map.sites, lift=resort.construct(base,upper).lift!;
  const {ux,uz}=lift.alignment;
  const start={x:upper.x-ux*29-uz*24,z:upper.z-uz*29+ux*24};
  const end={x:base.x+ux*29-uz*24,z:base.z+uz*29+ux*24};
  const trail=resort.constructTrail([start,end],20,[])!;
  assert.ok(trail);
  return {map,resort,lift,trail};
}

test('routes respect operating access, skill, trail status and return connectivity',()=>{
  const {map,resort,lift,trail}=fixture();
  assert.equal(findCircuits(resort,map,2).length,1);
  const sim=createGuestSimulation(map,resort);
  const max=trail.difficulty==='advanced'?2:1;
  for(let skill=0;skill<max;skill++) assert.equal(findCircuits(resort,map,skill as 0|1).length,0);
  const end=trail.points.at(-1)!;
  trail.connections.lowerLiftIds=[];
  trail.connections.reachesBase=false;
  assert.equal(findCircuits(resort,map,2).length,0);
  trail.connections.lowerLiftIds=[lift.id];
  assert.equal(findCircuits(resort,map,2)[0].trails[0].points.at(-1),end);
  resort.toggleTrail(trail.id);
  sim.refresh();
  for(let i=0;i<300;i++)sim.advance(1/30);
  assert.equal(sim.stats().guests,0);
  resort.toggleTrail(trail.id);
  resort.toggle(lift.id);sim.refresh();
  for(let i=0;i<300;i++)sim.advance(1/30);
  assert.equal(sim.stats().guests,0);
});

test('FIFO boarding shares actual chair poses, respects two seats, and completes a continuous loop',()=>{
  const {map,resort,lift,trail}=fixture();
  const sim=createGuestSimulation(map,resort), before=resort.funds;
  const seen=new Set<string>(), board:number[]=[];
  let previous:{x:number,y:number,z:number}|undefined, paused=false, returned=false, sharedSeat=false;
  const p={x:0,y:0,z:0,yaw:0};
  for(let i=0;i<14000;i++){
    sim.advance(1/30);
    const g=sim.guests.get(1);
    if(!g)continue;
    seen.add(g.activity);
    for(const person of sim.guests.values()){
      if(person.activity==='Boarding'&&!board.includes(person.id))board.push(person.id);
      if(person.chair<0)continue;
      const same=[...sim.guests.values()].filter(other=>other.chair===person.chair);
      assert.ok(same.length<=2);
      sharedSeat ||= same.length===2;
      assert.equal(new Set(same.map(other=>other.seat)).size,same.length);
    }
    if(g.activity==='Riding'){
      liftSeat(lift,g.chair,g.seat,p);
      assert.ok(Math.hypot(g.x-p.x,g.y-p.y,g.z-p.z)<.001);
      if(!paused) {
        resort.toggle(lift.id);sim.refresh();
        for(let j=0;j<120;j++)sim.advance(1/30);
        assert.ok(Math.hypot(g.x-p.x,g.y-p.y,g.z-p.z)<.001);
        resort.toggle(lift.id);sim.refresh();
        paused=true;
      }
    }
    if(g.activity==='Skiing'){
      assert.ok(trail.route.contains(g));
      assert.equal(g.y,map.sample(g.x,g.z).elevation);
    }
    if(previous) assert.ok(Math.hypot(previous.x-g.x,previous.y-g.y,previous.z-g.z)<2);
    previous={x:g.x,y:g.y,z:g.z};
    if(g.runs>0&&g.activity==='Arriving'){returned=true;break;}
  }
  assert.equal(board[0],1);
  assert.ok(board.length>1);
  for(const state of ['Arriving','Queuing','Boarding','Riding','Unloading','To trail','Skiing','Returning'])assert.ok(seen.has(state),state);
  assert.ok(paused&&returned&&sharedSeat);
  assert.ok(sim.stats().runs>=1);
  assert.equal(resort.funds,before);
});

test('demolition releases riders in place and reload restarts guests without spending funds',()=>{
  const {map,resort,lift}=fixture();
  const sim=createGuestSimulation(map,resort);
  for(let i=0;i<2000&&sim.stats().riding===0;i++)sim.advance(1/30);
  const rider=[...sim.guests.values()].find(g=>g.chair>=0)!;
  assert.ok(rider);
  const location={x:rider.x,y:rider.y,z:rider.z};
  resort.demolish(lift.id);sim.refresh();sim.advance(1/30);
  assert.equal(rider.chair,-1);
  assert.equal(rider.activity,'Resting');
  assert.deepEqual({x:rider.x,y:rider.y,z:rider.z},location);
  const save=resort.snapshot(), replay=createResort(map,save);
  assert.equal(replay.funds,resort.funds);
  assert.equal(replay.trails.size,1);
  assert.equal(createGuestSimulation(map,replay).stats().guests,0);
});

test('gate crossing detects loop wrap and does not repeat at the same distance',()=>{
  assert.equal(crossesGate(98,5,2,100),true);
  assert.equal(crossesGate(2,5,2,100),false);
  assert.equal(crossesGate(98,2,2,100),false);
});

test('closing a trail in flight stops admissions and blocks entry after the rider unloads',()=>{
  const {map,resort,trail}=fixture();
  const sim=createGuestSimulation(map,resort);
  for(let i=0;i<3000&&sim.guests.get(1)?.activity!=='Riding';i++)sim.advance(1/30);
  const guest=sim.guests.get(1)!;
  assert.equal(guest.activity,'Riding');
  resort.toggleTrail(trail.id);sim.refresh();
  const before=sim.guests.size;
  let unloaded=false, rested=false;
  for(let i=0;i<10000&&sim.guests.has(1);i++){
    sim.advance(1/30);
    assert.ok(sim.guests.size<=before);
    assert.notEqual(guest.activity,'Skiing');
    if(guest.activity==='Unloading')unloaded=true;
    if(guest.activity==='Resting')rested=true;
  }
  assert.ok(unloaded&&rested);
  assert.equal(sim.stats().runs,0);
});
