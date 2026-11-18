import type { GroundPoint } from './lifts/alignment';
import * as T from 'three';
import { HALF, randomStream, type Heightmap } from './terrain';
import type { Preferences } from './preferences';

const snow = new T.Color('#e7f4fa');
const shade = new T.Color('#a7c8dc');
const stone = new T.Color('#647786');
const lake = new T.Color('#a3ccd4');

function terrainMesh(map: Heightmap) {
  const { size, span, heights } = map;
  const positions = new Float32Array(heights.length * 3);
  const colors = new Float32Array(positions.length);
  const indices = new Uint32Array((size - 1) ** 2 * 6);
  const random = randomStream(map.seed + '/snow');
  const cell = span / (size - 1);
  const tint = new T.Color();
  let index = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const p = j * size + i;
      const x = i * cell - HALF, z = j * cell - HALF, h = heights[p];
      positions.set([x, h, z], p * 3);
      const { grade } = map.sample(x, z);
      const grain = random();
      const rock = T.MathUtils.smoothstep(grade + grain * 34, 116, 240) * T.MathUtils.smoothstep(h, 55, 215);
      tint.copy(shade).lerp(snow, .60 + grain * .3 + Math.min(h / 1400, .10)).lerp(stone, rock * .77);
      const basin = 1 - T.MathUtils.smoothstep(Math.hypot((x + 220) / 150, (z - 272) / 73), .67, 1);
      tint.lerp(lake, basin * .82);
      tint.toArray(colors, p * 3);
      if (i < size - 1 && j < size - 1) {
        indices.set([p, p + size, p + 1, p + 1, p + size, p + size + 1], index);
        index += 6;
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.setIndex(new T.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .94 }));
}

function terrainSides(map: Heightmap) {
  const rim: [number, number][] = [];
  const sides = [
    (n: number): [number, number] => [n, -HALF],
    (n: number): [number, number] => [HALF, n],
    (n: number): [number, number] => [-n, HALF],
    (n: number): [number, number] => [-HALF, -n]
  ];
  for (const side of sides) {
    for (let i = 0; i < map.size - 1; i++) rim.push(side(-HALF + i * map.span / (map.size - 1)));
  }
  const positions: number[] = [], colors: number[] = [];
  const top = new T.Color('#9bb9ca'), bottom = new T.Color('#3e586a');
  for (let i = 0; i < rim.length; i++) {
    const [x, z] = rim[i], [endX, endZ] = rim[(i + 1) % rim.length];
    const y = map.sample(x, z).elevation, endY = map.sample(endX, endZ).elevation;
    positions.push(x, y, z, endX, endY, endZ, x, -46, z, endX, endY, endZ, endX, -46, endZ, x, -46, z);
    for (const c of [top, top, bottom, top, bottom, bottom]) colors.push(c.r, c.g, c.b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide }));
}

function scatter(map: Heightmap) {
  const group = new T.Group();
  const maxTrees = 2200;
  const stations = Object.values(map.sites);
  const treeGeometries = [
    new T.CylinderGeometry(.26, .42, 4.3, 5),
    new T.ConeGeometry(2.45, 5.9, 6),
    new T.ConeGeometry(1.98, 5.2, 6),
    new T.ConeGeometry(1.42, 4.25, 6)
  ];
  const palette = ['#526361', '#287267', '#3b8276', '#87b8b0'].map(color => new T.Color(color));
  const treeMaterial = new T.MeshStandardMaterial({ flatShading: true, roughness: 1 });
  const trees = treeGeometries.map(geometry => new T.InstancedMesh(geometry, treeMaterial, maxTrees));
  const rocks = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ flatShading: true, roughness: 1 }), 220);
  const random = randomStream(map.seed + '/forest');
  const matrix = new T.Object3D();
  const tint = new T.Color();
  const forestPoints: GroundPoint[] = [];
  let count = 0;
  for (let i = 0; i < 13000 && count < maxTrees; i++) {
    const x = (random() - .5) * 922, z = (random() - .5) * 922;
    const { elevation, grade } = map.sample(x, z);
    const cover = random();
    const band = .48 + .25 * Math.sin(x * .030 + z * .015) + .22 * Math.cos(z * .032 - x * .013);
    const clearing = Math.hypot((x + 190) / 214, (z - 278) / 102);
    const face = map.openFace(x, z);
    if (grade > 82 || elevation > 285 || (clearing < 1.02 && cover > .015) || cover > band * .63 * (1 - face * .985)) continue;
    if (stations.some(site => Math.hypot(x - site.x, z - site.z) < site.radius + 4)) continue;
    const scale = .7 + random() ** 1.4 * 1.55;
    matrix.scale.setScalar(scale);
    matrix.rotation.set(0, random() * Math.PI, 0);
    [2, 4.1, 6.6, 9].forEach((height, layer) => {
      matrix.position.set(x, elevation + height * scale, z);
      matrix.updateMatrix();
      trees[layer].setMatrixAt(count, matrix.matrix);
      trees[layer].setColorAt(count, tint.copy(palette[layer]).multiplyScalar(.80 + cover * .62));
    });
    forestPoints.push({ x, z });
    count++;
  }
  trees.forEach(tree => { tree.count = count; group.add(tree); });
  let rockCount = 0;
  for (let i = 0; i < 2400 && rockCount < 220; i++) {
    const x = (random() - .5) * 920, z = (random() - .5) * 920;
    const { elevation, grade } = map.sample(x, z);
    if (elevation < 55 || grade < 43 || map.openFace(x, z) > .86) continue;
    const size = 1 + random() ** 2 * 7;
    matrix.position.set(x, elevation + size * .19, z);
    matrix.rotation.set(random(), random() * 6.28, random());
    matrix.scale.set(size, size * .63, size * .82);
    matrix.updateMatrix();
    rocks.setMatrixAt(rockCount, matrix.matrix);
    rocks.setColorAt(rockCount++, tint.copy(stone).lerp(snow, random() * .53));
  }
  rocks.count = rockCount;
  group.add(rocks);
  const scattered = [...trees, rocks].map(mesh => ({ mesh, original: mesh.instanceMatrix.array.slice(), count: mesh.count }));
  return {
    group,
    forestPoints,
    clearScenery(treeMask: (point: GroundPoint) => boolean, rockMask = treeMask) {
      const hiddenTrees = forestPoints.map(treeMask);
      // Keep the seeded buffers intact so demolished corridors recover their scenery.
      for (const { mesh, original, count } of scattered) {
        const target = mesh.instanceMatrix.array;
        target.set(original);
        for (let index = 0; index < count; index++) {
          const offset = index * 16;
          if (!(mesh === rocks ? rockMask({ x: original[offset + 12], z: original[offset + 14] }) : hiddenTrees[index])) continue;
          target.fill(0, offset, offset + 15);
          target[offset] = target[offset + 5] = target[offset + 10] = .001;
          target[offset + 13] = -110;
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.boundingSphere = null;
      }
    },
    quality(preferences: Preferences) {
      const ratio = { low: .30, standard: .68, high: 1 }[preferences.quality];
      trees.forEach(tree => {
        tree.visible = preferences.trees;
        tree.count = Math.floor(count * ratio);
        tree.boundingSphere = null;
      });
      rocks.count = Math.floor(rockCount * ratio);
      rocks.boundingSphere = null;
    }
  };
}

export function createEnvironment(scene: T.Scene) {
  const fog = new T.Fog('#c0dce4', 500, 3200);
  scene.fog = fog;
  const sky = new T.Mesh(new T.SphereGeometry(8500, 24, 12), new T.ShaderMaterial({
    side: T.BackSide,
    uniforms: { zenith: { value: new T.Color('#8ebcca') }, horizon: { value: new T.Color('#e2eff0') } },
    vertexShader: 'varying vec3 vWorld; void main() { vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y;
        vec3 color = mix(horizon, zenith, smoothstep(-.90, .31, h));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`
  }));
  scene.add(sky, new T.HemisphereLight('#eefaff', '#91a9b8', 1.66));
  const sun = new T.DirectionalLight('#fff1d8', 2.05);
  sun.position.set(-550, 730, 320);
  scene.add(sun);

  const floor = new T.Mesh(new T.PlaneGeometry(13000, 13000), new T.MeshBasicMaterial({ color: '#bed7df' }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -48;
  scene.add(floor);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 9, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(32, 64, 82, .50)');
  gradient.addColorStop(.55, 'rgba(32, 64, 82, .27)');
  gradient.addColorStop(1, 'rgba(32, 64, 82, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadow = new T.Mesh(new T.PlaneGeometry(1730, 1530), new T.MeshBasicMaterial({
    map: new T.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(75, -47.8, -55);
  scene.add(shadow);
  return fog;
}

export function createMountain(map: Heightmap) {
  const surface = terrainMesh(map);
  const sides = terrainSides(map);
  const forest = scatter(map);
  const group = new T.Group();
  group.add(surface, sides, forest.group);
  return {
    group, surface, quality: forest.quality, clearScenery: forest.clearScenery, forestPoints: forest.forestPoints,
    dispose() {
      group.removeFromParent();
      const materials = new Set<T.Material>();
      group.traverse(object => {
        if (object instanceof T.Mesh) {
          if (object instanceof T.InstancedMesh) object.dispose();
          object.geometry.dispose();
          materials.add(object.material);
        }
      });
      materials.forEach(material => material.dispose());
    }
  };
}
