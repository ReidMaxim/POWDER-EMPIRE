import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createMountain } from '../src/environment.ts';
import { createGuestSimulation } from '../src/guests/simulation.ts';
import { findCircuits } from '../src/guests/routing.ts';
import { FIXED_GRIP, sampleLoop } from '../src/lifts/alignment.ts';
import { createResort, freshResort, readResort, writeResort } from '../src/lifts/resort.ts';
import { generateTerrain, classifyGrade, type Heightmap } from '../src/terrain.ts';
import { demonstration, seeds } from './fixtures/evolution.ts';

function connectedArea(map: Heightmap, kind: 'beginner' | 'intermediate', maxZ: number) {
  const width = 96, height = Math.floor((maxZ + 270) / 8), mask = new Uint8Array(width * height);
  let area = 0, largest = 0;
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const grade = map.sample(-380 + i * 8, -270 + j * 8).grade;
    if (classifyGrade(grade) === kind) { mask[j * width + i] = 1; area++; }
  }
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const component = [i];
    mask[i] = 0;
    for (let j = 0; j < component.length; j++) {
      const cell = component[j];
      for (const neighbor of [cell % width ? cell - 1 : -1, cell % width < width - 1 ? cell + 1 : -1, cell - width, cell + width]) {
        if (mask[neighbor]) { mask[neighbor] = 0; component.push(neighbor); }
      }
    }
    largest = Math.max(largest, component.length);
  }
  return { area: area * 64, largest: largest * 64 };
}

for (const seed of seeds) test('Evolution supports an interconnected multi-area resort on ' + seed, () => {
  const { map, resort } = demonstration(seed);
  assert.equal(map.span, 1344);
  assert.equal(map.size, 256);
  assert.deepEqual(generateTerrain(seed, 'evolution').heights, map.heights);
  assert.ok(connectedArea(map, 'beginner', 325).largest > 65000);
  assert.ok(connectedArea(map, 'intermediate', 325).largest > 16000);
  assert.equal(resort.lifts.size, 3);
  assert.equal(resort.trails.size, 8);
  assert.ok(resort.funds > 0);
  for (const { alignment } of resort.lifts.values()) {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    for (let distance = 0; distance < alignment.loopLength; distance += 2) {
      sampleLoop(alignment, distance, pose);
      assert.ok(pose.y - map.sample(pose.x, pose.z).elevation >= FIXED_GRIP.minClearance - .35);
    }
  }
  assert.equal(findCircuits(resort, map, 0).length, 2);
  const intermediate = findCircuits(resort, map, 1).filter(c => c.lift.id === 2);
  assert.ok(intermediate.length >= 2);
  const advanced = findCircuits(resort, map, 2);
  assert.equal(advanced.length, 7);
  assert.equal(advanced.filter(c => c.lift.id === 3).length, 2);
  assert.deepEqual(advanced.filter(c => c.trails.length === 2).map(c => c.trails.map(t => t.id)), [[3, 5], [4, 5]]);
  const sim = createGuestSimulation(map, resort);
  const returns = new Set<string>();
  for (let i = 0; i < 26000; i++) {
    sim.advance(1 / 30);
    for (const guest of sim.guests.values()) if (guest.activity === 'Returning') returns.add(guest.circuit.lift.id + ':' + guest.skill);
  }
  assert.ok(returns.has('1:0') && returns.has('2:1') && returns.has('3:2'));
  if (seed === seeds[0]) {
    console.log('Default Evolution slope samples (m²)', connectedArea(map, 'beginner', 325), connectedArea(map, 'intermediate', 325));
    console.log('Default Evolution network funds/runs', resort.funds, sim.stats().runs);
  }
});

test('Classic migration preserves heightmap, infrastructure, and a usable guest circuit', () => {
  const map = generateTerrain(seeds[0]);
  assert.equal(createHash('sha256').update(Buffer.from(map.heights.buffer)).digest('hex'),
    '26849bb94e205edae6c1d6aa24dbd139791a3dea15b1185afe3f986fff96401a');
  const original = createResort(map, freshResort(map.seed));
  const lift = original.construct(map.sites.base, map.sites.upper).lift!;
  const { lower, upper, ux, uz } = lift.alignment;
  assert.ok(original.constructTrail([
    { x: upper.x - ux * 29 - uz * 24, z: upper.z - uz * 29 + ux * 24 },
    { x: lower.x + ux * 29 - uz * 24, z: lower.z + uz * 29 + ux * 24 }
  ], 20));
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  const snapshot = original.snapshot();
  storage.setItem('powder-empire.resort', JSON.stringify({ ...snapshot, terrainVersion: undefined, version: 2 }));
  const migrated = readResort(storage, map.seed);
  assert.deepEqual(migrated, snapshot);
  const restored = createResort(map, migrated);
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.equal(findCircuits(restored, map, 2).length, 1);

  const { map: newMap, resort } = demonstration();
  resort.toggle(2);
  resort.toggleTrail(8);
  assert.ok(writeResort(storage, restored.snapshot(), true));
  assert.ok(writeResort(storage, resort.snapshot()));
  const newSave = readResort(storage, map.seed);
  assert.deepEqual(createResort(newMap, newSave).snapshot(), resort.snapshot());
  assert.deepEqual(readResort(storage, map.seed, 'classic'), snapshot);
  assert.equal(createResort(newMap, migrated).lifts.size, 0);
});

test('Evolution trail construction masks seeded forest and can restore the original instances', () => {
  const { map, resort } = demonstration();
  const mountain = createMountain(map);
  const trail = [...resort.trails.values()].find(t => mountain.forestPoints.some(p => t.route.contains(p)))!;
  assert.ok(trail);
  const conifers = mountain.group.getObjectsByProperty('isInstancedMesh', true).slice(0, 2);
  const snapshots = () => conifers.map(mesh => mesh.instanceMatrix.array.slice());
  const before = snapshots();
  mountain.clearScenery(p => trail.route.contains(p), () => false);
  assert.notDeepEqual(snapshots(), before);
  mountain.clearScenery(() => false, () => false);
  assert.deepEqual(snapshots(), before);
  mountain.dispose();
});
