import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { classifyGrade, generateTerrain, GRID_SIZE, HALF, WORLD_SIZE } from '../src/terrain.ts';

test('the same seed reproduces every cell and other seeds produce different terrain', () => {
  const a = generateTerrain('FROST-001');
  assert.equal(a.size, 256);
  assert.equal(a.heights.length, GRID_SIZE ** 2);
  assert.deepEqual(a.heights, generateTerrain(a.seed).heights);
  assert.notDeepEqual(a.heights, generateTerrain('SNOW-TEST').heights);
});

test('Frostpeak has a summit, low base and a range of skiable slope grades', () => {
  const map = generateTerrain('FROST-001');
  assert.ok(Math.max(...map.heights) > 460);
  assert.ok(map.sample(-220, 272).elevation < 40);
  assert.ok(map.sample(-220, 272).grade < 12);
  const slopes = [];
  for (let z = -440; z <= 440; z += 20) {
    for (let x = -440; x <= 440; x += 20) {
      const sample = map.sample(x, z);
      if (sample.elevation > 45 && sample.grade >= 20 && sample.grade <= 70) slopes.push(sample);
    }
  }
  assert.ok(slopes.length > 100);
});

test('sampling matches the triangulation and clamps out-of-bounds coordinates', () => {
  const map = generateTerrain('FROST-001');
  const i = 93, j = 108, step = WORLD_SIZE / (GRID_SIZE - 1);
  const id = j * GRID_SIZE + i;
  const nw = map.heights[id], ne = map.heights[id + 1];
  const sw = map.heights[id + GRID_SIZE], se = map.heights[id + GRID_SIZE + 1];
  const a = map.sample(-HALF + (i + .25) * step, -HALF + (j + .25) * step);
  const b = map.sample(-HALF + (i + .75) * step, -HALF + (j + .75) * step);
  assert.ok(Math.abs(a.elevation - (.5 * nw + .25 * ne + .25 * sw)) < .00001);
  assert.ok(Math.abs(a.grade - Math.hypot(ne - nw, sw - nw) * 100 / step) < .00001);
  assert.ok(Math.abs(b.elevation - (.5 * se + .25 * ne + .25 * sw)) < .00001);
  assert.deepEqual(map.sample(900, -900), map.sample(HALF, -HALF));
});

const representativeSeeds = ['FROST-001', 'SNOW-JG70AC', 'SNOW-QA-2026', 'north:raven', 'powder/雪'];

for (const seed of representativeSeeds) {
  test(`seed ${seed} has connected skiable terrain, station benches, and steep alpine relief`, () => {
    const map = generateTerrain(seed);
    const { base, upper } = map.sites;
    const repeat = generateTerrain(seed);
    assert.deepEqual(map.heights, repeat.heights);
    assert.deepEqual(map.sites, repeat.sites);
    assert.ok(base.radius >= 25 && upper.radius >= 18);
    assert.ok(base.maxGrade < 7 && upper.maxGrade < 7);
    assert.ok(base.elevation < 40 && upper.elevation - base.elevation >= 120);
    assert.ok(Math.max(...map.heights) - base.elevation > 450);
    assert.ok(map.sample(-90, -145).grade > 70);

    // Count only the open face between the two station footprints. Walk its center
    // downhill and verify that a wide skiable cross-section persists along the face.
    let beginner = 0, intermediate = 0;
    let previousElevation = upper.elevation + 1;
    for (let z = upper.z + 35; z <= base.z - 40; z += 5) {
      const t = (z - upper.z) / (base.z - upper.z);
      const center = upper.x + (base.x - upper.x) * t * t * (3 - 2 * t);
      const sample = map.sample(center, z);
      assert.ok(sample.elevation <= previousElevation + .3);
      previousElevation = sample.elevation;
      for (let dx = -35; dx <= 35; dx += 5) {
        const x = center + dx;
        const band = classifyGrade(map.sample(x, z).grade);
        assert.equal(map.openFace(x, z), 1);
        assert.notEqual(band, 'extreme');
        if (band === 'beginner') beginner += 25;
        if (band === 'intermediate') intermediate += 25;
      }
    }
    assert.ok(beginner >= 2500 && intermediate >= 12000, `open face areas ${beginner}, ${intermediate}`);
    assert.ok(previousElevation - base.elevation < 9);
  });
}

test('prototype grade bands meet at 25, 40 and 70 percent', () => {
  assert.deepEqual([0, 25, 25.1, 40, 40.1, 70, 70.1].map(classifyGrade),
    ['beginner', 'beginner', 'intermediate', 'intermediate', 'advanced', 'advanced', 'extreme']);
});
