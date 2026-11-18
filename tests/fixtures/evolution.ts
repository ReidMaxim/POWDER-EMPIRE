import { createMountain } from "../../src/environment.ts";
import { strict as assert } from 'node:assert';
import { createResort, freshResort } from '../../src/lifts/resort.ts';
import type { OperatingLift } from '../../src/lifts/resort.ts';
import { generateTerrain } from '../../src/terrain.ts';

export const seeds = ['FROST-001', 'SNOW-JG70AC', 'SNOW-QA-2026', 'north:raven', 'powder/雪'];

function offset(lift: OperatingLift, t: number, side: number) {
  const { upper, lower, ux, uz } = lift.alignment;
  return {
    x: upper.x + (lower.x - upper.x) * t - uz * side,
    z: upper.z + (lower.z - upper.z) * t + ux * side
  };
}

export function demonstration(seed = seeds[0]) {
  const map = generateTerrain(seed, 'evolution');
  const resort = createResort(map, freshResort(seed, 'evolution'));
  const mountain = createMountain(map);
  const forest = mountain.forestPoints;
  mountain.dispose();
  const names = [
    ['Meadow Glide', 'Learning Loop'],
    ['West Traverse', 'Ridge Rambler', 'West Return', 'Aspen Way'],
    ['East Bowl', 'High Traverse']
  ];
  for (const site of map.liftSites) {
    const result = resort.construct(site.lower, site.upper);
    assert.ok(result.lift, site.name + ' lift placement failed');
  }
  for (const lift of resort.lifts.values()) {
    const t = 27 / Math.hypot(lift.upper.x - lift.lower.x, lift.upper.z - lift.lower.z);
    const at = (v: number, side: number) => offset(lift, v, side);
    const trailNames = [...names[lift.id - 1]];
    for (const side of [-1, 1]) {
      const start = at(t, 24 * side), end = at(1 - t, 24 * side);
      const junction = at(.63, -24);
      const routes = lift.id === 2 && side === -1
        ? [[start, at(.36, -64), junction], [start, at(.33, -32), junction], [junction, end]]
        : [[start, at(.45, side * 50), end]];
      for (const route of routes) {
        const name = trailNames.shift()!;
        const proposal = resort.proposeTrail(route, 12, forest);
        assert.deepEqual(proposal.issues, [], name);
        const trail = resort.constructTrail(route, 12, forest);
        assert.ok(trail, name);
        resort.renameTrail(trail.id, name);
      }
    }
  }
  return { map, resort };
}
