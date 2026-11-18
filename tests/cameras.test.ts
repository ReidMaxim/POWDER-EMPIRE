import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { EXPLORE_PITCH, ResortCameras } from '../src/cameras.ts';
import { generateTerrain } from '../src/terrain.ts';

const closeTo = (actual: number, expected: number, tolerance = .001) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${actual} near ${expected}`);
};
const direction = (camera: PerspectiveCamera | OrthographicCamera) => camera.getWorldDirection(new Vector3());

test('Explore can aim uphill at low ground clearance and clamps both pitch limits', () => {
  const map = generateTerrain('SNOW-JG70AC');
  const cameras = new ResortCameras();
  cameras.reducedMotion = true;
  cameras.resize(390, 844);
  assert.ok(cameras.update(1, map) instanceof OrthographicCamera);
  cameras.switchMode();
  const view = cameras.update(1, map);
  assert.ok(view instanceof PerspectiveCamera);

  // Pan from the focus to the base bench using the ordinary Explore pan input.
  const dx = map.sites.base.x, dz = map.sites.base.z + 18;
  const yaw = -Math.PI / 4, scale = 1200 * (1.3 / (390 / 844)) / 844;
  cameras.drag((-Math.cos(yaw) * dx + Math.sin(yaw) * dz) / scale,
    (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) * Math.sin(.44) / scale, true);
  cameras.zoom(-10);
  cameras.drag(0, -1000, false);
  cameras.update(1, map);
  closeTo(Math.asin(direction(view).y), -EXPLORE_PITCH.min);
  const { x, y, z } = view.position;
  const clearance = y - map.sample(x, z).elevation;
  assert.ok(clearance >= 6 && clearance < 10, `ground clearance ${clearance}`);

  cameras.drag(0, 1000, false);
  cameras.update(1, map);
  closeTo(Math.asin(direction(view).y), -EXPLORE_PITCH.max);
  cameras.reset();
  cameras.update(1, map);
  closeTo(Math.asin(direction(view).y), -.44);
  cameras.switchMode();
  const management = cameras.update(1, map);
  assert.ok(management instanceof OrthographicCamera);
  const before = direction(management);
  cameras.rotate(1);
  cameras.update(1, map);
  const after = direction(management);
  closeTo(before.x * after.x + before.z * after.z, 0);
  closeTo(before.y, after.y);
});

test('Explore remains above terrain during combined orbit, pitch, zoom, pan and mode changes', () => {
  for (const seed of ['FROST-001', 'SNOW-JG70AC', 'SNOW-QA-2026']) {
    const map = generateTerrain(seed);
    const cameras = new ResortCameras();
    cameras.resize(1440, 900);
    cameras.switchMode();
    for (let i = 0; i < 310; i++) {
      if (i === 130 || i === 220) cameras.switchMode();
      if (i % 8 === 0) cameras.drag(39 * Math.sin(i), 61 * Math.cos(i * .2), false);
      if (i % 11 === 0) cameras.drag(140 * Math.cos(i), 180 * Math.sin(i), true);
      if (i % 6 === 0) cameras.zoom(i < 100 ? -.3 : .13);
      const view = cameras.update(1 / 60, map);
      assert.ok(view.position.toArray().every(Number.isFinite));
      if (view instanceof PerspectiveCamera) {
        const { x, y, z } = view.position;
        assert.ok(y >= map.sample(x, z).elevation + 6 - 1e-8);
        assert.ok(direction(view).dot(new Vector3(0, 1, 0)) < .88);
      }
    }
    cameras.reset();
    assert.ok(cameras.update(2, map) instanceof PerspectiveCamera);
  }
});
