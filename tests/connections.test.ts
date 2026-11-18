import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { circuitStatus, findCircuits, queuePoint } from '../src/guests/routing.ts';
import { createGuestSimulation } from '../src/guests/simulation.ts';
import { createResort, freshResort } from '../src/lifts/resort.ts';
import { generateTerrain } from '../src/terrain.ts';
import { connectionZones, snapEndpoint } from '../src/trails/anchors.ts';
import { pedestrianPath, transferBudget } from '../src/trails/transfer.ts';

function fixture() {
  const map = generateTerrain('FROST-001','evolution');
  const resort = createResort(map,freshResort(map.seed,map.version));
  const { lift, issues } = resort.construct({x:-170,z:406},{x:-90,z:236});
  assert.deepEqual(issues,[]);
  assert.ok(lift);
  const points = [{x:-83.08079815963946,z:263.5703581023597},{x:-144.34572856112476,z:393.758335205516}];
  const trail = resort.constructTrail(points,12,[]);
  assert.ok(trail);
  return { map,resort,lift,trail };
}

test('linked beginner trail across a 188 m base approach admits guests and survives reload', () => {
  const { map,resort,lift,trail } = fixture();
  const base = map.sites.base;
  assert.equal(trail.difficulty,'beginner');
  assert.equal(trail.connections.state,'Connected');
  assert.deepEqual(trail.connections.upperLiftIds,[1]);
  assert.deepEqual(trail.connections.lowerLiftIds,[1]);
  const distance = Math.hypot(lift.lower.x-base.x,lift.lower.z-base.z);
  assert.ok(distance > 188 && distance < 189);
  assert.equal(pedestrianPath(map,base,lift.lower,180),undefined);
  assert.deepEqual(pedestrianPath(map,base,queuePoint(lift.alignment),transferBudget.base),[queuePoint(lift.alignment)]);
  assert.equal(resort.circuitStatus(trail),'Usable circuit · Beginner or higher');
  const saved = resort.snapshot();
  const restored = createResort(map,saved);
  assert.deepEqual(restored.snapshot(),saved);
  const sim = createGuestSimulation(map,restored);
  const activities = new Set<string>();
  for (let i=0; i<20000 && !activities.has('Returning'); i++) {
    sim.advance(1/30);
    const guest = sim.guests.get(1);
    if (guest) {
      assert.equal(guest.skill,0);
      activities.add(guest.activity);
    }
  }
  assert.equal(sim.stats().circuits,1);
  for (const activity of ['Boarding','Riding','Skiing','Returning']) assert.ok(activities.has(activity),activity);
});

test('a nearby anchor snaps outside station geometry and distant points remain manual', () => {
  const {map,resort,lift} = fixture();
  for (const width of [12,20,30] as const) {
    const zones = connectionZones(map,resort.lifts.values(),width);
    for (const zone of zones) {
      assert.ok(zone.anchors.length > 0);
      const anchor = zone.anchors[0];
      const match = snapEndpoint({x:anchor.x+2,z:anchor.z},zones,zone.end);
      assert.deepEqual(match?.point,anchor);
      assert.ok(Math.hypot(anchor.x-zone.center.x,anchor.z-zone.center.z)>11+width/2);
      assert.ok(map.sample(anchor.x,anchor.z).grade<=40);
    }
    assert.equal(snapEndpoint({x:lift.lower.x,z:lift.lower.z},zones,'Lower'),undefined);
    assert.equal(snapEndpoint({x:map.span/2,z:0},zones,'Upper'),undefined);
  }
});

test('pedestrian routing takes a bounded detour and rejects an impassable ridge', () => {
  const {map} = fixture();
  const a = {x:-24,z:0}, b={x:24,z:0};
  const ridge = (x:number) => Math.max(0,30-Math.abs(x)*4);
  const oneGap = {...map, sample(x:number,z:number) {
    return { elevation: ridge(x)*Math.max(0,1-Math.max(0,z-8)/8), grade: 0 };
  }};
  const barrier = {...map, sample(x:number) { return { elevation:ridge(x),grade:0 }; }};
  const detour = pedestrianPath(oneGap,a,b,90);
  assert.ok(detour && detour.length > 1 && detour.some(p=>p.z>=16));
  assert.equal(pedestrianPath(oneGap,a,b,49),undefined);
  assert.equal(pedestrianPath(barrier,a,b,transferBudget.base),undefined);
  assert.equal(pedestrianPath(map,a,{x:map.span,z:0},map.span*2),undefined);
});

test('the same network explains stopped lifts, closed trails, and blocked base access', () => {
  const {map,resort,lift,trail} = fixture();
  resort.toggle(lift.id);
  assert.equal(resort.circuitStatus(trail),'Chairlift 01 is stopped.');
  assert.equal(findCircuits(resort,map,0).length,0);
  assert.equal(createGuestSimulation(map,resort).stats().circuitHint,'Chairlift 01 is stopped.');
  resort.toggle(lift.id);
  resort.toggleTrail(trail.id);
  assert.match(resort.circuitStatus(trail),/^Trail closed/);
  resort.toggleTrail(trail.id);
  const cliff = {...map,sample(x:number,z:number) {
    return {elevation:map.sample(x,z).elevation+(x < -60 ? 520 : 0), grade:0};
  }};
  assert.match(circuitStatus(resort,cliff,trail),/^No safe walking route from the resort base/);
  assert.equal(findCircuits(resort,cliff,0).length,0);
});
