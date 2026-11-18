import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateTerrain, GRID_SIZE, HALF, WORLD_SIZE } from '../src/terrain.ts';

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
