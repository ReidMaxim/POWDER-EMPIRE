import * as T from 'three';
import { ResortCameras } from './cameras';
import { bindControls } from './controls';
import { createEnvironment, createMountain } from './environment';
import { loadPreferences, savePreferences, type Preferences } from './preferences';
import { generateTerrain } from './terrain';
import { createUI } from './ui';
import './style.css';

const preferences = loadPreferences();
const cameras = new ResortCameras();
const switchMode = () => {
  cameras.switchMode();
  ui.mode(cameras.explore);
};
let updateSettings = (_next: Preferences) => {};
const ui = createUI(document.querySelector<HTMLElement>('#app')!, preferences, {
  switchMode,
  rotate: turn => cameras.rotate(turn),
  zoom: amount => cameras.zoom(amount),
  reset: () => cameras.reset(),
  preferences(next) {
    savePreferences(next);
    updateSettings(next);
  }
});

function start() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) {
    ui.error('WebGL 2 is unavailable. Enable hardware acceleration or open Powder Empire in a WebGL 2 browser.');
    return;
  }
  const renderer = new T.WebGLRenderer({ canvas, context, antialias: true });
  renderer.outputColorSpace = T.SRGBColorSpace;
  canvas.setAttribute('aria-label', '3D mountain. Use arrow keys to pan, V to switch views and Q or E to rotate.');
  canvas.tabIndex = 0;
  ui.world.append(canvas);
  const scene = new T.Scene();
  const fog = createEnvironment(scene);
  let map = generateTerrain(preferences.seed);
  let mountain = createMountain(map);
  scene.add(mountain.group);
  ui.terrain(map);

  const marker = new T.Group();
  const ring = new T.Mesh(new T.RingGeometry(8, 11, 32), new T.MeshBasicMaterial({ color: '#ff9854', side: T.DoubleSide, depthTest: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 10;
  const needle = new T.Mesh(new T.ConeGeometry(3.6, 15, 6), new T.MeshBasicMaterial({ color: '#ffa868', depthTest: false }));
  needle.rotation.z = Math.PI;
  needle.position.y = 12;
  needle.renderOrder = 10;
  marker.add(ring, needle);
  marker.visible = false;
  scene.add(marker);
  const pointer = new T.Vector2();
  const ray = new T.Raycaster();
  let view = cameras.update(1, map);
  let dirty = true;
  const previousPose = new T.Matrix4();
  const previousProjection = new T.Matrix4();
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = ui.world;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, { low: 1, standard: 1.5, high: 2 }[preferences.quality]));
    renderer.setSize(width, height, false);
    cameras.resize(width, height);
    dirty = true;
  };
  updateSettings = next => {
    if (map.seed !== next.seed) {
      mountain.dispose();
      map = generateTerrain(next.seed);
      mountain = createMountain(map);
      scene.add(mountain.group);
      cameras.reset();
      marker.visible = false;
      ui.terrain(map);
      ui.inspect();
    }
    mountain.quality(next);
    cameras.reducedMotion = next.reducedMotion;
    resize();
  };
  updateSettings(preferences);
  new ResizeObserver(resize).observe(ui.world);
  bindControls(canvas, cameras, ui.dialog, (x, y) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, view);
    const hit = ray.intersectObject(mountain.surface)[0];
    marker.visible = Boolean(hit);
    dirty = true;
    if (!hit) {
      ui.inspect();
      return;
    }
    marker.position.copy(hit.point).add(new T.Vector3(0, 2, 0));
    const point = hit.point;
    ui.inspect({ ...map.sample(point.x, point.z), x: point.x, z: point.z });
  }, switchMode);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ui.error('The graphics context was interrupted. Waiting for the browser to restore it.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    ui.error('');
    dirty = true;
  });
  let last = performance.now();
  renderer.setAnimationLoop(time => {
    const dt = Math.min(.1, Math.max(0, (time - last) / 1000));
    last = time;
    if (context.isContextLost()) return;
    view = cameras.update(dt, map);
    if (!dirty && previousPose.equals(view.matrixWorld) && previousProjection.equals(view.projectionMatrix)) return;
    previousPose.copy(view.matrixWorld);
    previousProjection.copy(view.projectionMatrix);
    fog.near = cameras.fogNear;
    fog.far = fog.near + 2700;
    renderer.render(scene, view);
    dirty = false;
  });
}

start();
