import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createBusiness, dayLength, demand, economy, freshBusiness, hourlyCost } from '../src/business/economy.ts';
import { entranceGate } from '../src/business/entrance.ts';
import { createGuestSimulation } from '../src/guests/simulation.ts';
import { findCircuits, queuePoint } from '../src/guests/routing.ts';
import { createResort, freshResort, readResort, writeResort } from '../src/lifts/resort.ts';
import { blocksTransfer } from '../src/trails/transfer.ts';
import { generateTerrain } from '../src/terrain.ts';
import { connectionZones } from '../src/trails/anchors.ts';
import { demonstration } from './fixtures/evolution.ts';

const timestep = 1/30;
function meadow(seed = 'FROST-001', version: 'evolution'|'classic' = 'evolution') {
  const map = generateTerrain(seed,version);
  const resort = createResort(map,freshResort(seed,version));
  const site = map.liftSites[0];
  const {lift,issues} = resort.construct(site.lower,site.upper);
  assert.deepEqual(issues,[]);
  assert.ok(lift);
  const anchors = connectionZones(map,[lift],12);
  const points = anchors.map(zone=>zone.anchors[0]);
  const trail = resort.constructTrail(points,12,[]);
  assert.ok(trail,resort.proposeTrail(points,12,[]).issues.join(' '));
  return {map,resort,lift};
}
function settle(sim: ReturnType<typeof createGuestSimulation>, until: () => boolean, cap = 34000) {
  for (let i=0;i<cap && !until();i++) sim.advance(timestep);
  assert.ok(until());
}

test('the surveyed entrance fits both presets and rejects unsafe foundations, stations and boundaries', () => {
  for (const version of ['evolution','classic'] as const) {
    const {map,resort,lift} = meadow('FROST-001',version);
    const plot = resort.suggestEntrance();
    assert.ok(resort.entrancePlan(plot).usable);
    assert.match(resort.entrancePlan(lift.lower).issues.join(' '),/away from lifts/);
    assert.match(resort.entrancePlan({x:map.span/2,z:0}).issues.join(' '),/boundary/);
    const peakIndex = map.heights.indexOf(Math.max(...map.heights));
    const peak = {x:peakIndex%map.size*map.span/(map.size-1)-map.span/2,
      z:Math.floor(peakIndex/map.size)*map.span/(map.size-1)-map.span/2};
    assert.match(resort.entrancePlan(peak).issues.join(' '),/lower terrain/);
    const before=resort.funds;
    assert.ok(resort.buildEntrance(plot));
    assert.equal(resort.funds,before-economy.entranceCost);
    assert.equal(resort.buildEntrance(plot),false);
    assert.equal(resort.funds,before-economy.entranceCost);
    const circuit = findCircuits(resort,map,2)[0];
    assert.deepEqual(circuit.arrival.at(-1),queuePoint(lift.alignment));
    let from = entranceGate(plot);
    for (const to of circuit.arrival) {
      for (const obstacle of resort.routingAccess!.obstacles) assert.equal(blocksTransfer(obstacle,from,to),false);
      from = to;
    }
  }
});

test('a paying beginner enters at the plaza, completes a run, and leaves after closure without a second charge', () => {
  const {map,resort} = meadow();
  const entrance = resort.suggestEntrance();
  assert.ok(resort.buildEntrance(entrance));
  const sim = createGuestSimulation(map,resort,'opening-day'), business=resort.business;
  sim.setLimit(1);
  const start = resort.funds;
  sim.advance(timestep);
  assert.equal(sim.stats().guests,0);
  assert.ok(business.open(sim.stats().circuits>0));
  sim.advance(timestep);
  const guest = sim.guests.get(1)!;
  assert.ok(guest);
  assert.deepEqual({x:guest.x,z:guest.z},entranceGate(entrance));
  assert.equal(guest.y,map.sample(guest.x,guest.z).elevation);
  assert.equal(guest.ticket,45);
  assert.equal(guest.skill,0);
  assert.equal(business.data.ledger.admissions,1);
  assert.equal(resort.funds,start+45);
  settle(sim,()=>guest.activity==='Riding');
  const atBoarding = guest.satisfaction;
  assert.ok(business.close());
  assert.ok(sim.guests.has(guest.id));
  assert.ok(business.endDay());
  settle(sim,()=>business.data.phase==='report');
  assert.equal(business.data.ledger.admissions,1);
  assert.equal(business.data.ledger.revenue,45);
  assert.equal(business.data.ledger.departed,1);
  assert.equal(business.data.ledger.runs,1);
  assert.ok(guest.satisfaction>atBoarding);
  assert.ok(business.data.ledger.expenses>0);
  assert.equal(business.data.endingCash,start+45-business.data.ledger.expenses);
  assert.ok(business.nextDay());
  assert.equal(business.data.day,2);
  assert.equal(business.data.ledger.admissions,0);
  assert.equal(business.data.phase,'ready');
});

test('misconnected, inaccessible and stopped lifts never admit stranded or uncharged guests', () => {
  const {map,resort,lift} = meadow();
  const sim = createGuestSimulation(map,resort,'opening-day');
  assert.equal(resort.business.open(true),false);
  assert.ok(resort.buildEntrance(resort.suggestEntrance()));
  resort.toggle(lift.id);
  sim.refresh();
  assert.equal(sim.stats().circuits,0);
  assert.equal(resort.business.open(false),false);
  resort.toggle(lift.id);
  sim.refresh();
  assert.ok(resort.business.open(true));
  const gate = resort.routingAccess!.start;
  const cliff = {...map,sample(x:number,z:number) {
    const sample = map.sample(x,z);
    return {...sample,elevation:sample.elevation+(z<gate.z-6 ? 700 : 0)};
  }};
  const inaccessible = createGuestSimulation(cliff,resort,'opening-day');
  assert.equal(inaccessible.stats().circuits,0);
  assert.match(inaccessible.stats().circuitHint,/safe walking route from the entrance/);
  for (let i=0;i<500;i++) inaccessible.advance(timestep);
  assert.equal(resort.business.data.ledger.admissions,0);
});

test('hourly expenses follow simulation time, with no cash overdraft or suspended-tab catch-up', () => {
  const {lift} = meadow();
  const hourly = hourlyCost(lift.alignment);
  function ledger(speed: number, activeLift: boolean) {
    let cash=250000;
    const business=createBusiness({...freshBusiness(),entrance:{x:0,z:0}}, {balance:()=>cash,change:v=>{cash+=v;}});
    business.open(true);
    const hour = 3600/economy.clockRate;
    for (let i=0;i<hour/(timestep*speed);i++) for (let j=0;j<speed;j++) {
      business.advance(timestep,activeLift?hourly:0,0,0);
    }
    assert.ok(Math.abs(business.data.time-3600)<1e-6);
    return business.data.ledger.expenses;
  }
  assert.equal(ledger(1,true),hourly);
  assert.equal(ledger(4,true),hourly);
  assert.equal(ledger(4,false),0);
  let cash=1;
  const business=createBusiness({...freshBusiness(),entrance:{x:0,z:0}}, {balance:()=>cash,change:v=>{cash+=v;}});
  business.open(true);
  business.advance(86400,500,0,0);
  assert.ok(business.data.time<=15);
  assert.equal(cash,0);
  assert.equal(business.data.phase,'closed');
  assert.equal(business.data.cashHold,true);
  assert.equal(business.data.ledger.expenses,1);
});

test('v3 preset saves migrate without modifying funds or construction, and v4 reload never replays a sale', () => {
  const {map,resort} = meadow('north:raven');
  const original = resort.snapshot();
  let json = JSON.stringify({...original,version:3,business:undefined});
  const storage = {getItem:()=>json,setItem:(_:string,value:string)=>{json=value;}};
  const legacy = readResort(storage,map.seed);
  assert.equal(legacy.terrainVersion,'evolution');
  assert.equal(legacy.funds,original.funds);
  assert.equal(legacy.business.phase,'ready');
  assert.deepEqual(legacy.lifts,original.lifts);
  assert.deepEqual(legacy.trails,original.trails);
  assert.ok(resort.buildEntrance(resort.suggestEntrance()));
  assert.ok(resort.business.setPrice(65));
  const sim = createGuestSimulation(map,resort,'opening-day');
  resort.business.open(sim.stats().circuits>0);
  sim.advance(timestep);
  assert.equal(resort.business.data.ledger.revenue,65);
  assert.ok(writeResort(storage,resort.snapshot()));
  const restored=createResort(map,readResort(storage,map.seed));
  assert.deepEqual(restored.snapshot(),resort.snapshot());
  const resumed=createGuestSimulation(map,restored,'opening-day');
  resumed.advance(timestep);
  assert.equal(resumed.stats().guests,0);
  assert.equal(restored.business.data.ledger.revenue,65);
  assert.equal(restored.business.data.ledger.admissions,1);
  assert.ok(restored.business.data.ledger.ratings>0);
  assert.equal(restored.funds,resort.funds);
});

test('three resort sizes operate for three days at several prices and on multiple seeds', () => {
  const means: number[][] = [];
  const attendance: number[][] = [];
  for (const count of [1,2,3]) {
    const priceProfits: number[] = [], priceSales: number[] = [];
    for (const price of count===3 ? [15,45,150,75] : [15,45,150]) {
      const {map,resort} = demonstration(count===2?'north:raven':'FROST-001');
      for (const id of resort.trails.keys()) if (id > [0,1,6,8][count]) resort.demolishTrail(id);
      for (const id of resort.lifts.keys()) if (id > count) resort.demolish(id);
      assert.ok(resort.buildEntrance(resort.suggestEntrance()));
      const visitors=createGuestSimulation(map,resort,'opening-day');
      const business=resort.business;
      business.setPrice(price);
      const days=[];
      for (let day=1;day<=3;day++) {
        const start=resort.funds;
        assert.ok(business.open(visitors.stats().circuits>0));
        settle(visitors,()=>business.data.phase==='report');
        const {admissions,revenue,expenses,runs} = business.data.ledger;
        assert.equal(business.data.time,dayLength);
        assert.equal(revenue,admissions*price);
        assert.equal(resort.funds,start+revenue-expenses);
        assert.ok(runs>0);
        days.push([admissions,revenue-expenses]);
        assert.ok(business.nextDay());
      }
      console.log('Opening Day balance',count,'lifts, $'+price,JSON.stringify(days));
      priceSales.push(days.reduce((n,x)=>n+x[0],0));
      priceProfits.push(days.reduce((n,x)=>n+x[1],0));
    }
    assert.ok(priceSales[0] >= priceSales[1] && priceSales[1] > priceSales[2]);
    assert.ok(priceProfits[1] > priceProfits[2]);
    means.push(priceProfits);
    attendance.push(priceSales);
  }
  assert.ok(means[0][1]>0 && means[1][1]>0);
  assert.ok(means[2][1]<0 && means[2][3]>0);
  assert.ok(attendance[2][1]>attendance[0][1]);
  assert.ok(demand(45,3,2,85,1)>demand(45,3,2,45,1));
});
