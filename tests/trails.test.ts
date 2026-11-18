import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateTerrain, type Heightmap } from '../src/terrain.ts';
import { beginNewResort, createResort, freshResort, readResort, writeResort } from '../src/lifts/resort.ts';
import { createFootprint, planTrail, TRAIL } from '../src/trails/route.ts';
import { sceneryMasks } from '../src/trails/clearing.ts';

const map = generateTerrain('FROST-001');
const ramp = (height: (x: number, z: number) => number): Heightmap => ({
  ...map, sample: (x,z) => ({ elevation: height(x,z), grade: 10 })
});
const endpoints = [{x: 0,z: 0},{x: 0,z: 200}];

function connected(seed = map.seed) {
  const terrain = generateTerrain(seed);
  const resort = createResort(terrain, freshResort(seed));
  const { base, upper } = terrain.sites;
  const lift = resort.construct(base,upper).lift!;
  const dx = lift.alignment.ux, dz = lift.alignment.uz;
  // The lift direction points uphill. Offset the trail to one side of the cable.
  const start = {x: upper.x - dx * 29 - dz * 24, z: upper.z - dz * 29 + dx * 24};
  const end = {x: base.x + dx * 29 - dz * 24, z: base.z + dz * 29 + dx * 24};
  return { terrain,resort,lift,start,end };
}

test('tessellated curves preserve endpoints, sample the actual heightmap and have continuous horizontal distance', () => {
  const surface = ramp((x,z) => 200 - z * .35 + Math.sin(x / 20));
  const points = [{x:0,z:0},{x:55,z:85},{x:-70,z:160},{x:5,z:220}];
  const result = planTrail(surface,points,20);
  assert.deepEqual(result.issues,[]);
  const run = result.route!;
  assert.ok(run.length > 250);
  assert.equal(run.samples[0].z,0);
  assert.equal(run.samples.at(-1)?.x,5);
  assert.ok(!run.samples.some(p => p.x === 55 && p.z === 85));
  for (let i=0;i<run.samples.length;i++) {
    const p=run.samples[i], last=run.samples[i-1];
    assert.equal(p.y,surface.sample(p.x,p.z).elevation);
    if (last) assert.ok(p.distance > last.distance && p.distance - last.distance < 2.4);
  }
  assert.equal(run.average,run.drop/run.length*100);
  assert.ok(Math.abs(Object.values(run.distribution).reduce((a,b)=>a+b,0)-run.length)<1e-8);
});

test('width drives both conservation of forest and boundary validation', () => {
  const trees=[{x:4,z:90},{x:8,z:90},{x:14,z:90},{x:20,z:90},{x:0,z:-8}];
  const terrain=ramp((_,z)=>100-z*.3);
  const narrow=planTrail(terrain,endpoints,12,[],trees);
  const wide=planTrail(terrain,endpoints,30,[],trees);
  assert.equal(narrow.route?.width,12);
  assert.deepEqual(narrow.trees,[trees[0]]);
  assert.deepEqual(wide.trees,trees.slice(0,3).concat(trees[4]));
  assert.equal(wide.route?.cost, TRAIL.baseCost + 200 * 30 * TRAIL.areaRate + 4 * TRAIL.treeRate);
  assert.equal(createFootprint(endpoints,6)({x:0,z:-6}),true);
  assert.match(planTrail(terrain,endpoints.map(p=>({...p,x:474})),20).issues.join(),/boundary/);
});

test('grade bands use sustained sections rather than average or isolated raw spikes', () => {
  for (const [grade,band] of [[20,'beginner'],[32,'intermediate'],[56,'advanced'],[78,'extreme']] as const) {
    const result=planTrail(ramp((_,z)=>300-z*grade/100),endpoints,12);
    assert.deepEqual(result.issues,[]);
    assert.equal(result.route?.difficulty,band);
    assert.ok(Math.abs(result.route!.maximum-grade)<1e-8);
  }
  const local = planTrail(ramp((_,z)=>180-z*.2-(z>=100?5:0)),endpoints,12);
  assert.ok(local.route!.rawMaximum>90);
  assert.notEqual(local.route!.difficulty,'extreme');
  const steep = planTrail(ramp((_,z)=>180-z*.14-Math.min(40,Math.max(0,z-80))*.48),endpoints,12);
  assert.ok(steep.route!.average<25);
  assert.equal(steep.route!.difficulty,'advanced');
});

test('rejects reverse and shallow runs, cliffs, sustained climbs, and lift infrastructure', () => {
  assert.match(planTrail(ramp((_,z)=>z*.3), endpoints,12).issues.join(),/below/);
  assert.match(planTrail(ramp((_,z)=>200-z), endpoints,12).issues.join(),/cliff/);
  const uphill = ramp((_,z)=>200 - .38*z + Math.min(40,Math.max(0,z-70))*.85);
  assert.match(planTrail(uphill,endpoints,12).issues.join(),/uphill/);
  assert.match(planTrail(ramp((_,z)=>200-z*.4),[endpoints[0],{x:0,z:45}],12).issues.join(),/75 m/);
  const { resort, lift }=connected();
  assert.match(resort.proposeTrail([lift.upper,lift.lower],20).issues.join(),/station.*tower|tower.*station/);
});

test('representative seeds support deterministic valid trails and two lift endpoint links', () => {
  for (const seed of ['FROST-001','SNOW-JG70AC','SNOW-QA-2026','north:raven']) {
    const {resort,start,end} = connected(seed);
    const result=resort.proposeTrail([start,end],20);
    assert.deepEqual(result.issues,[],seed);
    assert.equal(result.connections?.state,'Connected');
    assert.deepEqual(result.connections?.upperLiftIds,[1]);
    assert.deepEqual(result.connections?.lowerLiftIds,[1]);
    assert.equal(result.connections?.reachesBase,true);
    const repeated=resort.proposeTrail([start,end],20);
    assert.equal(result.route?.difficulty,repeated.route?.difficulty);
    assert.deepEqual(result.route?.samples,repeated.route?.samples);
  }
});

test('trails form directed junctions and closing the downstream trail removes the return path', () => {
  const {resort,start,end}=connected();
  const midpoint={x:(start.x+end.x)/2,z:(start.z+end.z)/2};
  const first=resort.constructTrail([start,midpoint],12,[])!;
  assert.equal(first.connections.state,'Partial');
  const second=resort.constructTrail([midpoint,end],12,[])!;
  assert.deepEqual(first.connections.outgoingTrailIds,[second.id]);
  assert.deepEqual(second.connections.incomingTrailIds,[first.id]);
  assert.equal(first.connections.state,'Connected');
  assert.equal(second.connections.state,'Connected');
  resort.toggleTrail(second.id);
  assert.equal(first.connections.state,'Partial');
  resort.demolish(1);
  assert.equal(first.connections.state,'Isolated');
  assert.equal(second.connections.state,'Partial');
});

test('drafts preserve scenery and stacked masks restore only eligible conifers', () => {
  const terrain=ramp((_,z)=>150-z*.25);
  const trees=[{x:0,z:90},{x:9,z:90},{x:17,z:90},{x:40,z:90}];
  const points2=endpoints.map(point=>({...point,x:12}));
  const a=planTrail(terrain,endpoints,20,[],trees).route!;
  const b=planTrail(terrain,points2,20,[],trees).route!;
  assert.equal(trees.filter(sceneryMasks([],[]).tree).length,0);
  const initial = trees.map(point=>({...point}));
  assert.deepEqual(trees.filter(sceneryMasks([],[a,b]).tree),trees.slice(0,3));
  assert.deepEqual(trees.filter(sceneryMasks([],[b]).tree),trees.slice(1,3));
  assert.deepEqual(trees.filter(sceneryMasks([],[]).tree),[]);
  assert.deepEqual(trees,initial);
  assert.equal(trees.some(sceneryMasks([],[a]).rock),false);
});

test('version 1 migrates lift phase and funds; trails restore independently with cost, name and status', () => {
  const { terrain, resort, start, end, lift } = connected();
  resort.advance(6);
  resort.toggle(lift.id);
  const liftSave=resort.snapshot();
  let data=JSON.stringify({version:1,seed:liftSave.seed,funds:liftSave.funds,nextId:liftSave.nextId,lifts:liftSave.lifts});
  const storage={getItem:()=>data,setItem:(_:string,value:string)=>{data=value;}};
  const migrated=readResort(storage, terrain.seed);
  assert.equal(migrated.version,3);
  assert.deepEqual(migrated,liftSave);
  const restored=createResort(terrain,migrated);
  const trees=[{x:(start.x+end.x)/2,z:(start.z+end.z)/2}];
  const funds=restored.funds;
  assert.ok(restored.proposeTrail([start,end],20,trees).route);
  assert.equal(restored.funds,funds);
  assert.equal(restored.trails.size,0);
  const a=restored.constructTrail([start,end],20,trees)!;
  const b=restored.constructTrail([start,end],12,[])!;
  assert.equal(restored.funds,funds-a.cost-b.cost);
  restored.renameTrail(a.id,'  Timberline  ');
  restored.toggleTrail(a.id);
  writeResort(storage,restored.snapshot());
  const reloaded=createResort(terrain,readResort(storage, terrain.seed));
  assert.deepEqual(reloaded.snapshot(),restored.snapshot());
  assert.equal(reloaded.trails.get(a.id)?.name,'Timberline');
  assert.equal(reloaded.trails.get(a.id)?.open,false);
  assert.equal(reloaded.trails.get(b.id)?.open,true);
  assert.equal(reloaded.lifts.get(lift.id)?.running,false);
  const remaining=reloaded.funds;
  reloaded.demolishTrail(b.id);
  assert.equal(reloaded.funds,remaining);
  assert.equal(beginNewResort(reloaded,'OTHER',()=>false),undefined);
  assert.deepEqual(beginNewResort(reloaded,'OTHER',()=>true),freshResort('OTHER'));
  const poor=createResort(terrain,{...migrated,funds:0});
  assert.match(poor.proposeTrail([start,end],20).issues.join(),/funds/);
  assert.equal(poor.constructTrail([start,end],20,[]),undefined);
});

test('render tessellation follows a real cell boundary across both heightmap faces', async () => {
  const { conformSurface } = await import('../src/trails/conform.ts');
  const geo = conformSurface(map,
    [201,0,-100, 214,0,-89, 199,0,-83],
    [1,0,0,0,1,0,0,0,1], [0,1,2], .1);
  assert.ok(geo.positions.length > 9);
  assert.equal(geo.positions.length,geo.colors.length);
  for(let i=0;i<geo.positions.length;i+=9) {
    const p=geo.positions.slice(i,i+9);
    const x=(p[0]+p[3]+p[6])/3,z=(p[2]+p[5]+p[8])/3,y=(p[1]+p[4]+p[7])/3;
    assert.ok(Math.abs(y-.1-map.sample(x,z).elevation)<1e-5);
  }
});
