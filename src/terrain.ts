export const GRID_SIZE = 256;
export const WORLD_SIZE = 960;
export const BASE_ALTITUDE = 1250;
export const HALF = WORLD_SIZE / 2;
export type TerrainVersion = 'classic' | 'evolution';
export const terrainTitles: Record<TerrainVersion, string> = { classic: 'Frostpeak Classic', evolution: 'Frostpeak Evolution' };
export const isTerrainVersion = (v: unknown): v is TerrainVersion => v === 'classic' || v === 'evolution';
export interface LiftSite {
  readonly name: string;
  readonly lower: StationSite;
  readonly upper: StationSite;
}

export interface TerrainSample {
  elevation: number;
  grade: number;
}

export type SlopeBand = 'beginner' | 'intermediate' | 'advanced' | 'extreme';

/** Prototype grade bands, independent of any future trail difficulty rating. */
export function classifyGrade(grade: number): SlopeBand {
  if (grade <= 25) return 'beginner';
  if (grade <= 40) return 'intermediate';
  if (grade <= 70) return 'advanced';
  return 'extreme';
}

export interface StationSite {
  readonly x: number;
  readonly z: number;
  readonly elevation: number;
  readonly radius: number;
  readonly maxGrade: number;
}

export interface Heightmap {
  readonly seed: string;
  readonly version: TerrainVersion;
  readonly liftSites: readonly LiftSite[];
  readonly size: number;
  readonly span: number;
  readonly heights: Float32Array;
  readonly sites: Readonly<{ base: StationSite; upper: StationSite }>;
  /** Influence of the open eastern face, from zero at the forest to one in the clearing. */
  openFace(x: number, z: number): number;
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

export function generateTerrain(seed: string, version: TerrainVersion = 'classic'): Heightmap {
  return version === 'evolution' ? evolution(seed) : classic(seed);
}

function classic(seed: string): Heightmap {
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
  const faceX = 165 + rng() * 32;
  const faceDrift = 56 + rng() * 29;
  const faceRise = 122 + rng() * 15;
  const topZ = -135, baseZ = 333;
  const baseHeight = 20 + rng() * 4;
  const faceCenter = (z: number) => faceX + faceDrift * smooth(clamp((z - topZ) / (baseZ - topZ), 1));
  const openFace = (x: number, z: number) => {
    const across = 1 - smooth(clamp((Math.abs(x - faceCenter(z)) - 56) / 105, 1));
    const along = smooth(clamp((z - topZ + 101) / 74, 1)) *
      (1 - smooth(clamp((z - baseZ - 26) / 115, 1)));
    return across * along;
  };

  const heights = new Float32Array(GRID_SIZE * GRID_SIZE);
  for (let j = 0; j < GRID_SIZE; j++) {
    for (let i = 0; i < GRID_SIZE; i++) {
      const x = 2 * i / (GRID_SIZE - 1) - 1, z = 2 * j / (GRID_SIZE - 1) - 1;
      const warp = noise(x * 2 + 8, z * 2 + 8);
      const dx = x - peakX + .095 * warp, dz = z - peakZ;
      const across = dx + dz * ridgeAngle;
      const main = Math.max(0, 1 - Math.hypot(across * 1.14, dz * .89));
      const shoulder = Math.max(0, 1 - Math.hypot((x - .43 + .20 * (z + .51)) * 1.55, (z + .51) * 1.38));
      const spur = Math.max(0, 1 - Math.hypot((x + .49 - (z - .03) * .45) * 2.05, (z - .02) * 1.40));
      const mass = Math.max(Math.pow(main, 1.75) * summit, Math.pow(shoulder, 1.55) * summit * .68, Math.pow(spur, 1.42) * summit * .48);
      const apron = Math.max(0, 1 - Math.hypot((x + .36 - .35 * (z - .12)) * 1.85, (z - .12) * 1.18));
      const apronHeight = Math.pow(apron, 1.65) * summit * .26;
      const detail = noise(x * 5 + 12, z * 5 + 12) * 26 + noise(x * 10 + 24, z * 10 + 24) * 13 + noise(x * 21 + 32, z * 21 + 32) * 8;
      const base = 14 + noise(x * 3 + 3, z * 3 + 3) * 8;
      const basin = clamp((Math.hypot((x + .46) / .41, (z - .565) / .23) - .65) / .53, 1);
      const relief = base + Math.max(mass, apronHeight) + detail * clamp(mass / 120, 1);
      const worldX = x * HALF, worldZ = z * HALF;
      const acrossFace = worldX - faceCenter(worldZ);
      const run = clamp((worldZ - topZ - 25) / (baseZ - topZ - 59), 1);
      // Integrate a constant-grade middle with shorter, rounded transitions to the benches.
      const rounded = .13;
      const descent = (run < rounded ? run ** 2 / (2 * rounded)
        : run > 1 - rounded ? 1 - rounded - (1 - run) ** 2 / (2 * rounded)
        : run - rounded / 2) / (1 - rounded);
      const rolling = noise(x * 7 + 17, z * 7 + 17) * 3.0 *
        smooth(clamp(Math.min(run, 1 - run) * 7, 1));
      const crossfall = (1 - Math.cos(acrossFace / 43)) * 3.1;
      const face = baseHeight + faceRise * (1 - descent) + rolling + crossfall;
      const blend = openFace(worldX, worldZ);
      const natural = mix(12, relief, smooth(basin));
      heights[j * GRID_SIZE + i] = mix(natural, face, blend);
    }
  }
  return assemble(seed, 'classic', WORLD_SIZE, heights, openFace, [
    { name: 'Eastern face', lower: {x:faceCenter(baseZ),z:baseZ}, upper:{x:faceCenter(topZ),z:topZ} }
  ]);
}

type Ground = {x:number;z:number};
type Site = {name:string;lower:Ground;upper:Ground};

function evolution(seed: string): Heightmap {
  const rng = randomStream(seed + '/evolution-1');
  const noiseGrid = Float32Array.from({length:4096},()=>rng()*2-1);
  const noise = (x:number,z:number) => {
    const i=Math.floor(x), j=Math.floor(z), a=smooth(x-i), b=smooth(z-j);
    const at=(u:number,v:number)=>noiseGrid[(u&63)+(v&63)*64];
    return mix(mix(at(i,j),at(i+1,j),a),mix(at(i,j+1),at(i+1,j+1),a),b);
  };
  const span=1344, half=span/2, baseZ=325, beginnerTop=82, westTop=-186, eastTop=-252;
  const west=-278+(rng()-.5)*23, east=290+(rng()-.5)*21;
  const sites:Site[]=[
    {name:'Meadow',lower:{x:0,z:baseZ},upper:{x:0,z:beginnerTop}},
    {name:'West Ridge',lower:{x:-132,z:baseZ-10},upper:{x:west,z:westTop}},
    {name:'East Bowl',lower:{x:132,z:baseZ-12},upper:{x:east,z:eastTop}}
  ];
  const westRise=125+rng()*7, eastRise=218+rng()*12, meadowRise=28.8+rng()*1.4;
  const take=(t:number)=>smooth(clamp(t,1));
  // Integrated rounded ramp: a shallow toe and shoulders around a broader central fall line.
  function profile(z:number, top:number, toe:number){
    const t=clamp((toe-z)/(toe-top),1), ease=.18;
    if(t<ease) return t*t/(2*ease*(1-ease));
    if(t>1-ease) return 1-(1-t)**2/(2*ease*(1-ease));
    return (t-ease/2)/(1-ease);
  }
  const alpine=(x:number,z:number)=>take((-z-140)/280)*take((Math.abs(x)+300)/550);
  const heights = new Float32Array(GRID_SIZE*GRID_SIZE);
  const summitShift=(rng()-.5)*64;
  const summit = (x:number,z:number,cx:number,cz:number,wx:number,wz:number) =>
    Math.max(0,1-Math.hypot((x-cx+.27*(z-cz))/wx,(z-cz)/wz));
  for(let j=0;j<GRID_SIZE;j++)for(let i=0;i<GRID_SIZE;i++){
    const x=i*span/(GRID_SIZE-1)-half,z=j*span/(GRID_SIZE-1)-half;
    const t=take((baseZ-z)/530);
    const wCenter=mix(-132,west,t), eCenter=mix(132,east,t);
    const westSide=1-take((Math.abs(x-wCenter)-52)/225), eastSide=1-take((Math.abs(x-eCenter)-54)/237);
    const central=1-take((Math.abs(x)-63)/127);
    const meadow=meadowRise*profile(z,beginnerTop+20,baseZ)*central;
    const divide=mix(take((Math.abs(x)-53)/96),1,take((-z+30)/210));
    const w=westRise*profile(z,westTop+10,baseZ-6)*westSide*divide;
    const e=eastRise*profile(z,eastTop+10,baseZ-10)*eastSide*divide;
    const shelf=30*take((-z-110)/305)*(1-take((Math.abs(x)-40)/345));
    const ridgeZ=-421+summitShift*.3;
    const left=summit(x,z,-306+summitShift,ridgeZ,335,250);
    const right=summit(x,z,330+summitShift,-475,317,231);
    const saddle=summit(x,z,14+summitShift,-475,430,260);
    const peaks=Math.max(265*left**1.48,334*right**1.38,173*saddle**1.38);
    const rolling=(noise(x/160+7,z/150+13)*5.6+noise(x/64+24,z/68+20)*2.0) *
      mix(.26,1,take((Math.abs(x)-45)/125)+take((-z+50)/240)*(1-take((Math.abs(x)-45)/125)));
    const ridgeTextures=(noise(x/54+13,z/65+6)*16+noise(x/23+32,z/26+29)*6)*take(peaks/125);
    const valley=-14*Math.exp(-(((x-30+Math.sin(z/135)*37)/54)**2))*take((-z-5)/240);
    let height=18+Math.max(meadow,w,e)+shelf+valley+peaks+ridgeTextures+rolling;
    const edge=take((half-Math.max(Math.abs(x),Math.abs(z)))/143);
    height=mix(14+rolling*.4,height,edge);
    // Compact local benches blend into the broad slopes. Their surface and use remain editable by players.
    for(const site of sites)for(const point of [site.lower,site.upper]){
      const distance=Math.hypot(x-point.x,z-point.z);
      if(distance>=62) continue;
      const h=point===site.lower?18:site===sites[0]?18+meadowRise:site===sites[1]?18+westRise:18+eastRise;
      height=mix(h,height,take((distance-19)/43));
    }
    heights[j*GRID_SIZE+i]=height;
  }
  return assemble(seed,'evolution',span,heights,alpine,sites);
}

function assemble(seed:string,version:TerrainVersion,span:number,heights:Float32Array,
  openFace:Heightmap['openFace'],candidates:Site[]):Heightmap {
  const half=span/2, step=span/(GRID_SIZE-1);
  function sample(x: number, z: number): TerrainSample {
    const u = clamp((x + half) / step, GRID_SIZE - 1);
    const v = clamp((z + half) / step, GRID_SIZE - 1);
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

  function station(x: number, z: number, radius: number): StationSite {
    let maxGrade = 0;
    // Sample both triangles of each grid cell that overlaps the footprint's bounding square.
    const firstCell = (center: number) => Math.floor((center - radius + half) / step);
    const lastCell = (center: number) => Math.floor((center + radius + half) / step);
    for (let j = firstCell(z); j <= lastCell(z); j++) {
      for (let i = firstCell(x); i <= lastCell(x); i++) {
        maxGrade = Math.max(maxGrade,
          sample((i + .25) * step - half, (j + .25) * step - half).grade,
          sample((i + .75) * step - half, (j + .75) * step - half).grade);
      }
    }
    return { x, z, radius, elevation: sample(x, z).elevation, maxGrade };
  }

  const liftSites = candidates.map(({name,lower,upper}) => ({name,
    lower:station(lower.x,lower.z,28),upper:station(upper.x,upper.z,version==='classic'?21:11)}));
  return {seed,version,size:GRID_SIZE,span,heights,openFace,sample,liftSites,
    sites:{base:liftSites[0].lower,upper:liftSites[0].upper}};
}
