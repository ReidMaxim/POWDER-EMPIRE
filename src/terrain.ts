export const GRID_SIZE = 256;
export const WORLD_SIZE = 960;
export const BASE_ALTITUDE = 1250;
export const HALF = WORLD_SIZE / 2;
const step = WORLD_SIZE / (GRID_SIZE - 1);

export interface TerrainSample {
  elevation: number;
  grade: number;
}

export interface Heightmap {
  readonly seed: string;
  readonly size: number;
  readonly span: number;
  readonly heights: Float32Array;
  sample(x: number, z: number): TerrainSample;
}

export function seedHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function randomStream(seed: string): () => number {
  let state = seedHash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export function generateTerrain(seed: string): Heightmap {
  const rng = randomStream(seed);
  const lattice = Float32Array.from({ length: 4096 }, () => rng() * 2 - 1);
  const noise = (x: number, z: number) => {
    const i = Math.floor(x), j = Math.floor(z);
    const a = smooth(x - i), b = smooth(z - j);
    const at = (u: number, v: number) => lattice[(u & 63) + (v & 63) * 64];
    return mix(mix(at(i, j), at(i + 1, j), a), mix(at(i, j + 1), at(i + 1, j + 1), a), b);
  };
  const peakX = -.21 + rng() * .19, peakZ = -.40 + rng() * .21;
  const summit = 515 + rng() * 95;
  const ridgeAngle = .42 + rng() * .4;
  const heights = new Float32Array(GRID_SIZE * GRID_SIZE);
  for (let j = 0; j < GRID_SIZE; j++) {
    for (let i = 0; i < GRID_SIZE; i++) {
      const x = 2 * i / (GRID_SIZE - 1) - 1, z = 2 * j / (GRID_SIZE - 1) - 1;
      const warp = noise(x * 2 + 8, z * 2 + 8);
      const dx = x - peakX + .095 * warp, dz = z - peakZ;
      const across = dx + dz * ridgeAngle;
      const main = Math.max(0, 1 - Math.hypot(across * 1.14, dz * .89));
      const shoulder = Math.max(0, 1 - Math.hypot((x - .40 + .20 * (z + .25)) * 1.55, (z + .29) * 1.38));
      const spur = Math.max(0, 1 - Math.hypot((x + .49 - (z - .03) * .45) * 2.05, (z - .02) * 1.40));
      const mass = Math.max(Math.pow(main, 1.75) * summit, Math.pow(shoulder, 1.55) * summit * .68, Math.pow(spur, 1.42) * summit * .48);
      const apron = Math.max(0, 1 - Math.hypot((x + .36 - .35 * (z - .12)) * 1.85, (z - .12) * 1.18));
      const apronHeight = Math.pow(apron, 1.65) * summit * .26;
      const detail = noise(x * 5 + 12, z * 5 + 12) * 26 + noise(x * 10 + 24, z * 10 + 24) * 13 + noise(x * 21 + 32, z * 21 + 32) * 8;
      const base = 14 + noise(x * 3 + 3, z * 3 + 3) * 8;
      const basin = clamp((Math.hypot((x + .46) / .41, (z - .565) / .23) - .65) / .53, 1);
      const relief = base + Math.max(mass, apronHeight) + detail * clamp(mass / 120, 1);
      heights[j * GRID_SIZE + i] = mix(12, relief, smooth(basin));
    }
  }
  return {
    seed, size: GRID_SIZE, span: WORLD_SIZE, heights,
    sample(x, z) {
      const u = clamp((x + HALF) / step, GRID_SIZE - 1);
      const v = clamp((z + HALF) / step, GRID_SIZE - 1);
      const i = Math.min(Math.floor(u), GRID_SIZE - 2);
      const j = Math.min(Math.floor(v), GRID_SIZE - 2);
      const offset = j * GRID_SIZE + i, a = u - i, b = v - j;
      const nw = heights[offset], ne = heights[offset + 1];
      const sw = heights[offset + GRID_SIZE], se = heights[offset + GRID_SIZE + 1];
      const upper = a + b <= 1;
      const dx = upper ? ne - nw : se - sw;
      const dz = upper ? sw - nw : se - ne;
      const elevation = upper ? nw + dx * a + dz * b : se + dx * (a - 1) + dz * (b - 1);
      return { elevation, grade: Math.hypot(dx, dz) * 100 / step };
    }
  };
}
