import * as T from 'three';
import { ResortCameras } from './cameras';
import { bindControls } from './controls';
import { createEnvironment, createMountain } from './environment';
import { loadPreferences, savePreferences, type Preferences } from './preferences';
import { generateTerrain } from './terrain';
import { createUI } from './ui';
import { distanceToRun, FIXED_GRIP } from './lifts/alignment';
import { createConstruction } from './lifts/construction';
import { bindLiftPanel } from './lifts/panel';
import { createLiftLayer } from './lifts/render';
import { beginNewResort, createResort, readResort, writeResort } from './lifts/resort';
import './style.css';

const preferences = loadPreferences();
function writableStorage() {
  try { return window.localStorage; } catch { return undefined; }
}
const storage = writableStorage();
const saved = readResort(storage, preferences.seed);
preferences.seed = saved.seed;
const cameras = new ResortCameras();
const switchMode = () => {
  cameras.switchMode();
  ui.mode(cameras.explore);
};
let updateSettings = (_next: Preferences) => true;
const root = document.querySelector<HTMLElement>('#app')!;
const ui = createUI(root, preferences, {
  switchMode,
  rotate: turn => cameras.rotate(turn),
  zoom: amount => cameras.zoom(amount),
  reset: () => cameras.reset(),
  preferences(next) {
    if (!updateSettings(next)) return false;
    savePreferences(next);
    return true;
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
  let resort = createResort(map, saved);
  let construction = createConstruction(map, resort);
  let selected: number | undefined;
  const lifts = createLiftLayer(scene);
  for (const lift of resort.lifts.values()) lifts.add(map, lift);
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
  let renderQuality = preferences.quality;
  const previousPose = new T.Matrix4();
  const previousProjection = new T.Matrix4();
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = ui.world;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, { low: 1, standard: 1.5, high: 2 }[renderQuality]));
    renderer.setSize(width, height, false);
    cameras.resize(width, height);
    dirty = true;
  };
  const persist = () => {
    if (writeResort(storage, resort.snapshot())) return true;
    liftPanel.notice('Storage is unavailable. Resort changes will last for this session only.');
    return false;
  };
  const clearScenery = () => {
    const plans = [...resort.lifts.values()].map(lift => lift.alignment);
    mountain.clearScenery((x, z) => plans.some(plan =>
      Math.hypot(x - plan.lower.x, z - plan.lower.z) < FIXED_GRIP.stationRadius + 3 ||
      Math.hypot(x - plan.upper.x, z - plan.upper.z) < FIXED_GRIP.stationRadius + 3 ||
      distanceToRun({ x, z }, plan.lower, plan.upper) < FIXED_GRIP.turnRadius + 5
    ));
  };
  function updateLiftPanel() {
    const draft = construction.draft;
    lifts.preview(map, draft?.lower ?? draft?.invalidLower, draft?.upper, draft?.proposal.alignment, !draft?.proposal.issues.length);
    lifts.select(selected);
    liftPanel.update(draft, selected === undefined ? undefined : resort.lifts.get(selected), resort.nextName);
    liftPanel.budget(resort.funds, resort.lifts.values(), selected);
    dirty = true;
  }
  const liftPanel = bindLiftPanel(root, {
    start() {
      if (construction.draft) return;
      selected = undefined;
      marker.visible = false;
      ui.inspect();
      construction.start();
      updateLiftPanel();
    },
    cancel() {
      construction.cancel();
      selected = undefined;
      updateLiftPanel();
    },
    back() {
      construction.back();
      updateLiftPanel();
    },
    surveyed() {
      if (!construction.draft) return;
      construction.place(construction.draft.lower ? map.sites.upper : map.sites.base);
      updateLiftPanel();
    },
    confirm() {
      const lift = construction.confirm();
      if (lift) {
        lifts.add(map, lift);
        clearScenery();
        selected = lift.id;
        persist();
      }
      updateLiftPanel();
    },
    toggle() {
      if (selected === undefined) return;
      resort.toggle(selected);
      persist();
      updateLiftPanel();
    },
    demolish() {
      if (selected === undefined) return;
      const lift = resort.lifts.get(selected);
      if (!lift || !window.confirm(`Demolish ${lift.name}? Construction costs are unrecoverable.`)) return;
      if (resort.demolish(selected)) {
        lifts.remove(selected);
        clearScenery();
        selected = undefined;
        persist();
        updateLiftPanel();
      }
    },
    select(id) {
      if (id && !resort.lifts.has(id)) return;
      construction.cancel();
      selected = id || undefined;
      marker.visible = false;
      ui.inspect();
      updateLiftPanel();
    }
  });
  updateSettings = next => {
    if (map.seed !== next.seed) {
      const newSave = beginNewResort(resort, next.seed, () =>
        window.confirm('Start a new resort on this seed? This clears all lifts and resets funds to $250,000.')
      );
      if (!newSave) return false;
      for (const id of resort.lifts.keys()) lifts.remove(id);
      mountain.dispose();
      map = generateTerrain(newSave.seed);
      resort = createResort(map, newSave);
      construction = createConstruction(map, resort);
      selected = undefined;
      persist();
      mountain = createMountain(map);
      scene.add(mountain.group);
      cameras.reset();
      marker.visible = false;
      ui.terrain(map);
      ui.inspect();
      updateLiftPanel();
    }
    renderQuality = next.quality;
    mountain.quality(next);
    cameras.reducedMotion = next.reducedMotion;
    resize();
    return true;
  };
  clearScenery();
  updateLiftPanel();
  updateSettings(preferences);
  new ResizeObserver(resize).observe(ui.world);
  bindControls(canvas, cameras, ui.dialog, (x, y) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, view);
    const hit = ray.intersectObject(mountain.surface)[0];
    if (construction.draft) {
      if (hit) construction.place({ x: hit.point.x, z: hit.point.z });
      else construction.miss();
      updateLiftPanel();
      return;
    }
    const liftHit = ray.intersectObjects(lifts.pickables, false)[0];
    if (liftHit && (!hit || liftHit.distance < hit.distance)) {
      marker.visible = false;
      ui.inspect();
      selected = liftHit.object.userData.liftId as number;
      updateLiftPanel();
      return;
    }
    if (selected !== undefined) {
      selected = undefined;
      updateLiftPanel();
    }
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
    const dt = Math.max(0, (time - last) / 1000);
    last = time;
    if (context.isContextLost()) return;
    view = cameras.update(Math.min(.1, dt), map);
    if (resort.advance(dt)) {
      lifts.animate(resort.lifts.values());
      dirty = true;
    }
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
