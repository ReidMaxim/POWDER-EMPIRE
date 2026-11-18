import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateTerrain, type Heightmap } from '../src/terrain.ts';
import { FIXED_GRIP, chairDistance, planLift, sampleLoop, type ChairPose } from '../src/lifts/alignment.ts';
import { createConstruction } from '../src/lifts/construction.ts';
import { beginNewResort, createResort, freshResort, readResort, STARTING_FUNDS, writeResort } from '../src/lifts/resort.ts';

const map = generateTerrain('FROST-001');
const { base, upper } = map.sites;
const plan = planLift(map, base, upper).alignment!;
const second = { lower: { x: base.x + 35, z: base.z }, upper: { x: upper.x + 35, z: upper.z } };
const fixture = (sample: Heightmap['sample']): Heightmap => ({ ...map, sample });

test('surveyed benches accept a terrain-aware lift across representative seeds', () => {
  for (const seed of ['FROST-001', 'SNOW-JG70AC', 'SNOW-QA-2026', 'powder/雪']) {
    const terrain = generateTerrain(seed);
    const result = planLift(terrain, terrain.sites.base, terrain.sites.upper);
    assert.deepEqual(result.issues, [], seed);
    const line = result.alignment!;
    assert.ok(line.uphillLength > 470 && line.rise > 120 && line.towers.length >= 5);
    for (const tower of line.towers) {
      const height = tower.y - terrain.sample(tower.x, tower.z).elevation;
      assert.ok(height >= FIXED_GRIP.cableHeight && height <= FIXED_GRIP.maxTowerHeight);
    }
    const pose = { x: 0, z: 0, y: 0, yaw: 0 };
    for (let d = 0; d < line.loopLength; d += .5) {
      sampleLoop(line, d, pose);
      assert.ok(pose.y - terrain.sample(pose.x, pose.z).elevation >= FIXED_GRIP.minClearance - .2,
        `clearance below threshold at ${seed} ${d}`);
    }
  }
});

test('invalid height, grades, bounds, span and missing survey data report actionable issues', () => {
  assert.match(planLift(map, upper, base).issues.join(), /higher/);
  assert.match(planLift(map, base, { x: -80, z: -140 }).issues.join(), /grade/);
  assert.match(planLift(map, { x: 479, z: 0 }, upper).issues.join(), /map edge/);
  const flat = fixture((x) => ({ elevation: x / 5, grade: 0 }));
  assert.match(planLift(flat, { x: 0, z: 0 }, { x: 80, z: 0 }).issues.join(), /100–700/);
  assert.match(planLift(flat, { x: -425, z: 0 }, { x: 425, z: 0 }).issues.join(), /100–700/);
  const missing = fixture(() => ({ elevation: NaN, grade: 0 }));
  assert.match(planLift(missing, base, upper).issues.join(), /terrain data/);
});

test('adds a support over a resolvable terrain hump and rejects an impossible near-terminal ridge', () => {
  const a = { x: -200, z: 0 }, b = { x: 200, z: 0 };
  const hill = fixture(x => ({ elevation: (x + 200) * .12 + 33 * Math.exp(-((x / 22) ** 2)), grade: 12 }));
  const route = planLift(hill, a, b);
  assert.deepEqual(route.issues, []);
  assert.ok(route.alignment!.towers.length > Math.ceil(400 / FIXED_GRIP.spacing) - 1);
  const wall = fixture(x => ({ elevation: (x + 200) * .12 + (x > -191 && x < -188 ? 90 : 0), grade: 12 }));
  assert.match(planLift(wall, a, b).issues.join(), /clear|tower/);
  const missingSpan = fixture(x => ({ elevation: Math.abs(x) < 4 ? NaN : (x + 200) * .12, grade: 12 }));
  assert.match(planLift(missingSpan, a, b).issues.join(), /missing terrain/);
});

test('blocks crossing or overlapping infrastructure and permits a separate alignment', () => {
  assert.match(planLift(map, base, upper, [plan]).issues.join(), /another lift/);
  assert.ok(planLift(map, second.lower, second.upper, [plan]).alignment);
  const ramp = fixture((_, z) => ({ elevation: (300 - z) / 5, grade: 5 }));
  const first = planLift(ramp, { x: -110, z: 190 }, { x: 110, z: -180 }).alignment!;
  assert.ok(first);
  assert.match(planLift(ramp, { x: 110, z: 190 }, { x: -110, z: -180 }, [first]).issues.join(), /crossing/);
});

test('cost is assessed once, cancellation changes nothing, and lack of funds blocks construction', () => {
  const resort = createResort(map, freshResort(map.seed)), draft = createConstruction(map, resort);
  assert.equal(plan.cost, FIXED_GRIP.baseCost + Math.round(plan.uphillLength * FIXED_GRIP.perMeter) + plan.towers.length * FIXED_GRIP.perTower);
  draft.start();
  draft.place(base);
  draft.place(upper);
  assert.ok(draft.draft?.proposal.alignment);
  draft.back();
  assert.equal(draft.draft?.upper, undefined);
  draft.place(upper);
  draft.cancel();
  assert.deepEqual(resort.snapshot(), freshResort(map.seed));
  draft.start();
  draft.place(base);
  draft.place(upper);
  assert.ok(draft.confirm());
  assert.equal(draft.confirm(), undefined);
  assert.equal(resort.funds, STARTING_FUNDS - plan.cost);
  assert.equal(resort.construct(base, upper).lift, undefined);
  assert.ok(resort.demolish(1));
  assert.equal(resort.funds, STARTING_FUNDS - plan.cost);

  const broke = createResort(map, { ...freshResort(map.seed), funds: plan.cost - 1 });
  assert.match(broke.construct(base, upper).issues.join(), /Insufficient/);
  assert.equal(broke.funds, plan.cost - 1);
  assert.equal(broke.lifts.size, 0);
});

const pose = (d: number) => {
  const p: ChairPose = { x: 0, y: 0, z: 0, yaw: 0 };
  sampleLoop(plan, d, p);
  return p;
};
const distance = (a: ChairPose, b: ChairPose) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('chairs use arc-length spacing and continuous geometry through both return wheels', () => {
  const spacing = plan.loopLength / plan.chairCount;
  for (let i = 1; i < plan.chairCount; i++) {
    assert.ok(Math.abs(chairDistance(plan, 18, i) - chairDistance(plan, 18, i - 1) - spacing) < 1e-9);
  }
  for (const seam of [0, plan.uphillLength, plan.uphillLength + Math.PI * FIXED_GRIP.turnRadius,
    2 * plan.uphillLength + Math.PI * FIXED_GRIP.turnRadius, plan.loopLength]) {
    const before = pose(seam - .001), after = pose(seam + .001);
    assert.ok(distance(before, after) < .0021);
    assert.ok(Math.cos(before.yaw - after.yaw) > .999999);
  }
  assert.ok(pose(80).y > pose(20).y);
  assert.ok(pose(plan.uphillLength + 120).y < pose(plan.uphillLength + 60).y);
});

test('lift phases are time-based and stop and start independently without resetting', () => {
  const first = createResort(map, freshResort(map.seed));
  const other = createResort(map, freshResort(map.seed));
  const a = first.construct(base, upper).lift!;
  const b = first.construct(second.lower, second.upper).lift!;
  const c = other.construct(base, upper).lift!;
  assert.ok(a && b && c);
  for (let i = 0; i < 120; i++) first.advance(1 / 60);
  other.advance(2);
  assert.ok(Math.abs(a.phase - c.phase) < 1e-8);
  first.toggle(a.id);
  const stopped = a.phase, moving = b.phase;
  first.advance(3);
  assert.equal(a.phase, stopped);
  assert.ok(b.phase > moving);
  first.toggle(a.id);
  assert.equal(a.phase, stopped);
  first.advance(1);
  assert.ok(Math.abs(a.phase - stopped - FIXED_GRIP.speed) < 1e-8);
});

test('restore retains two lifts, configuration, funds, paused phase and independent status', () => {
  let json: string | null = null;
  const storage = { getItem: () => json, setItem: (_key: string, value: string) => { json = value; } };
  assert.deepEqual(readResort(storage, 'legacy-seed'), freshResort('legacy-seed'));
  const resort = createResort(map, freshResort(map.seed));
  resort.construct(base, upper);
  resort.construct(second.lower, second.upper);
  resort.advance(9);
  resort.toggle(1);
  assert.ok(writeResort(storage, resort.snapshot()));
  const saved = readResort(storage, 'legacy-seed');
  const restored = createResort(map, saved);
  assert.deepEqual(restored.snapshot(), resort.snapshot());
  assert.deepEqual(restored.lifts.get(1)?.alignment, resort.lifts.get(1)?.alignment);
  assert.equal(restored.lifts.get(1)?.running, false);
  assert.equal(restored.lifts.get(2)?.running, true);
  assert.equal(restored.lifts.get(1)?.configuration, FIXED_GRIP.id);
  assert.equal(restored.funds, resort.funds);
  assert.equal(createResort(generateTerrain('OTHER'), saved).lifts.size, 0);
  assert.equal(beginNewResort(restored, 'OTHER', () => false), undefined);
  assert.equal(restored.lifts.size, 2);
  assert.deepEqual(beginNewResort(restored, 'OTHER', () => true), freshResort('OTHER'));
  assert.equal(beginNewResort(restored, map.seed, () => { throw Error('same seed'); }), undefined);
});
