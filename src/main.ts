import * as T from 'three';
import { ResortCameras } from './cameras';
import { bindControls } from './controls';
import { createEnvironment, createMountain } from './environment';
import { loadPreferences, savePreferences, type Preferences } from './preferences';
import { generateTerrain, type TerrainVersion } from './terrain';
import { createUI } from './ui';
import type { GroundPoint } from './lifts/alignment';
import { createConstruction } from './lifts/construction';
import { bindLiftPanel } from './lifts/panel';
import { createLiftLayer } from './lifts/render';
import { beginNewResort, createResort, readResort, writeResort } from './lifts/resort';
import { sceneryMasks } from './trails/clearing';
import { createTrailLayer } from './trails/render';
import { bindTrailPanel, type TrailDraft } from './trails/panel';
import { TRAIL } from './trails/route';
import { connectionZones, snapEndpoint } from './trails/anchors';
import { createGuestSimulation } from './guests/simulation';
import { createGuestLayer } from './guests/render';
import { bindGuestPanel } from './guests/panel';
import { economy } from './business/economy';
import { entranceGate, entranceRadius } from './business/entrance';
import { bindBusinessPanel } from './business/panel';
import { entranceLayer } from './business/render';
import './style.css';

const preferences = loadPreferences();
function writableStorage() {
  try { return window.localStorage; } catch { return undefined; }
}
const storage = writableStorage();
const saved = readResort(storage, preferences.seed);
preferences.seed = saved.seed;
const cameras = new ResortCameras();
let clearGuestFollow = () => {};
let changeTrailView = (_explore: boolean) => {};
const switchMode = () => {
  cameras.switchMode();
  ui.mode(cameras.explore);
  changeTrailView(cameras.explore);
};
let updateSettings = (_next: Preferences, _version?:TerrainVersion) => true;
const root = document.querySelector<HTMLElement>('#app')!;
const ui = createUI(root, preferences, {
  switchMode,
  rotate: turn => cameras.rotate(turn),
  zoom: amount => cameras.zoom(amount),
  reset: () => { clearGuestFollow(); cameras.reset(); },
  preferences(next,version) {
    if (!updateSettings(next,version)) return false;
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
  let map = generateTerrain(preferences.seed,saved.terrainVersion);
  cameras.setWorldSpan(map.span);
  cameras.reset();
  let mountain = createMountain(map);
  let resort = createResort(map, saved);
  let visitors = createGuestSimulation(map,resort,'opening-day');
  const people = createGuestLayer(scene);
  let selectedGuest: number | undefined;
  let following = false, guestPace = 1, guestClock = 0;
  let construction = createConstruction(map, resort);
  let selected: number | undefined;
  const lifts = createLiftLayer(scene);
  const trails = createTrailLayer(scene);
  const entrance = entranceLayer(scene);
  let entranceDraft: GroundPoint | undefined;
  let savedRevision = resort.business.revision, nextCheckpoint = 0;
  let trailDraft: TrailDraft | undefined;
  let selectedTrail: number | undefined;
  let availableTrees: GroundPoint[] = [];
  changeTrailView = explore => {
    if (!explore) clearGuestFollow();
    trails.mode(explore); dirty = true;
  };
  for (const trail of resort.trails.values()) trails.add(map, trail);
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
  const checkpoint = () => {
    savedRevision = resort.business.revision;
    if (writeResort(storage, resort.snapshot())) return true;
    liftPanel.notice('Storage is unavailable. Resort changes will last for this session only.');
    return false;
  };
  const persist = () => {
    visitors.refresh();
    drawEntrance();
    return checkpoint();
  };
  const clearScenery = () => {
    const mask = sceneryMasks([...resort.lifts.values()].map(lift => lift.alignment),
      [...resort.trails.values()].map(trail => trail.route));
    const building = resort.business.data.entrance;
    const gate = building && entranceGate(building);
    const clearEntrance = (point: GroundPoint) => !!building && (
      Math.hypot(point.x-building.x,point.z-building.z) < entranceRadius+3 ||
      Math.hypot(point.x-gate!.x,point.z-gate!.z) < 6);
    const hideTree = (point: GroundPoint) => clearEntrance(point) || mask.tree(point);
    mountain.clearScenery(hideTree,point=>clearEntrance(point) || mask.rock(point));
    availableTrees = mountain.forestPoints.filter(point => !hideTree(point));
  };
  function refreshTrailDraft() {
    if (trailDraft) {
      trailDraft.plan = resort.proposeTrail(trailDraft.points, trailDraft.width, availableTrees);
      trailDraft.zones = connectionZones(map,resort.lifts.values(),trailDraft.width);
    }
    trails.draft(map, trailDraft?.points ?? [], trailDraft?.plan, trailDraft?.zones, trailDraft?.snappedPoint);
    updateLiftPanel();
  }
  function placeTrailPoint(point: GroundPoint, allowSnap = true) {
    if (!trailDraft || trailDraft.reviewing) return;
    if (trailDraft.points.length >= TRAIL.maxPoints) trailDraft.message = 'Use at most 32 waypoints.';
    else {
      const match = allowSnap && snapEndpoint(point,trailDraft.zones ?? [],trailDraft.points.length ? 'Lower' : 'Upper');
      trailDraft.points.push(match ? match.point : point);
      trailDraft.snap = match ? match.zone.end + ' anchor snapped · ' + match.zone.label : undefined;
      trailDraft.snappedPoint = match ? match.point : undefined;
      trailDraft.message = undefined;
    }
    refreshTrailDraft();
  }
  function updateLiftPanel() {
    const draft = construction.draft;
    lifts.preview(map, draft?.lower ?? draft?.invalidLower, draft?.upper, draft?.proposal.alignment, !draft?.proposal.issues.length);
    const chosen = selectedTrail === undefined ? undefined : resort.trails.get(selectedTrail);
    lifts.select(chosen ? undefined : selected);
    lifts.highlight(chosen ? [...chosen.connections.reachableUpperLiftIds, ...chosen.connections.reachableLowerLiftIds] : []);
    trails.select(selectedTrail);
    liftPanel.update(draft, selected === undefined ? undefined : resort.lifts.get(selected), resort.nextName);
    liftPanel.budget(resort.funds, resort.lifts.values(), selected);
    trailPanel.update(trailDraft, chosen, resort);
    dirty = true;
  }
  const liftPanel = bindLiftPanel(root, {
    start() {
      closeEntranceDraft();
      businessPanel.show(false);
      if (construction.draft) return;
      trailDraft = undefined;
      selectedTrail = undefined;
      trails.draft(map, []);
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
      const selector=root.querySelector<HTMLSelectElement>('#lift-site')!;
      const site=map.liftSites[Number(selector.value)]??map.liftSites[0];
      construction.place(construction.draft.lower ? site.upper : site.lower);
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
      trailDraft = undefined;
      selectedTrail = undefined;
      trails.draft(map, []);
      construction.cancel();
      selected = id || undefined;
      marker.visible = false;
      ui.inspect();
      updateLiftPanel();
    }
  });
  const trailPanel = bindTrailPanel(root, {
    start() {
      closeEntranceDraft();
      businessPanel.show(false);
      if (trailDraft) return;
      construction.cancel();
      selected = selectedTrail = undefined;
      marker.visible = false;
      ui.inspect();
      trailDraft = { points: [], width: 20, reviewing: false };
      refreshTrailDraft();
    },
    close() {
      trailDraft = undefined;
      selectedTrail = undefined;
      refreshTrailDraft();
    },
    width(width) {
      if (!trailDraft) return;
      trailDraft.width = width;
      refreshTrailDraft();
    },
    undo() {
      if (!trailDraft) return;
      if (trailDraft.reviewing) trailDraft.reviewing = false;
      else { trailDraft.points.pop(); trailDraft.snap = undefined; trailDraft.snappedPoint = undefined; }
      trailDraft.message = undefined;
      refreshTrailDraft();
    },
    review() {
      if (!trailDraft?.plan?.route || trailDraft.plan.issues.length) return;
      trailDraft.reviewing = true;
      updateLiftPanel();
    },
    suggested() {
      if (!trailDraft) return;
      const towardBase = !!trailDraft.points.length;
      const end = towardBase ? 'Lower' : 'Upper';
      const previous = trailDraft.points[0];
      const upperZone = previous && [...(trailDraft.zones ?? [])].filter(z=>z.end==='Upper')
        .sort((a,b)=>Math.hypot(a.center.x-previous.x,a.center.z-previous.z)-Math.hypot(b.center.x-previous.x,b.center.z-previous.z))[0];
      const firstLift = [...resort.lifts.values()].find(l=>l.name===upperZone?.label) ?? resort.lifts.values().next().value;
      const anchors = trailDraft.zones?.find(z=>z.end===end && z.label===firstLift?.name)?.anchors;
      const anchor = anchors?.[0];
      if (anchor) { placeTrailPoint(anchor); return; }
      const upper = firstLift?.alignment.upper ?? map.sites.upper;
      const lower = firstLift?.alignment.lower ?? map.sites.base;
      const from = towardBase ? lower : upper, to = towardBase ? upper : lower;
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const side = firstLift ? 24 * (towardBase ? -1 : 1) : 0;
      placeTrailPoint({x: from.x + ((to.x - from.x) * 29 + (to.z - from.z) * side) / length,
        z: from.z + ((to.z - from.z) * 29 - (to.x - from.x) * side) / length});
    },
    confirm() {
      if (!trailDraft?.reviewing) return;
      const trail = resort.constructTrail(trailDraft.points, trailDraft.width, availableTrees);
      if (!trail) { refreshTrailDraft(); return; }
      trailDraft = undefined;
      selectedTrail = trail.id;
      trails.add(map, trail);
      clearScenery();
      persist();
      refreshTrailDraft();
    },
    select(id) {
      if (id && !resort.trails.has(id)) return;
      construction.cancel();
      selected = undefined;
      selectedTrail = id || undefined;
      trailDraft = undefined;
      marker.visible = false;
      ui.inspect();
      refreshTrailDraft();
    },
    rename(name) {
      if (selectedTrail !== undefined && resort.renameTrail(selectedTrail, name)) persist();
      updateLiftPanel();
    },
    toggle() {
      if (selectedTrail !== undefined && resort.toggleTrail(selectedTrail)) persist();
      updateLiftPanel();
    },
    demolish() {
      if (selectedTrail === undefined) return;
      const trail = resort.trails.get(selectedTrail);
      if (!trail || !window.confirm(`Demolish ${trail.name}? Construction costs are unrecoverable.`)) return;
      if (resort.demolishTrail(trail.id)) {
        trails.remove(trail.id);
        selectedTrail = undefined;
        clearScenery();
        persist();
        updateLiftPanel();
      }
    }
  });
  function updateGuests() {
    const guest = selectedGuest === undefined ? undefined : visitors.guests.get(selectedGuest);
    guestPanel.update(visitors,resort,guest,following);
  }
  clearGuestFollow = () => {
    following = false;
    cameras.track();
    dirty = true;
    updateGuests();
  };
  function selectGuest(id?:number) {
    selectedGuest = id;
    people.select(id);
    clearGuestFollow();
    if (id !== undefined) guestPanel.show();
  }
  const guestPanel = bindGuestPanel(root,{
    find() {
      const all = [...visitors.guests.keys()];
      if (all.length) selectGuest(all[(all.indexOf(selectedGuest ?? -1)+1)%all.length]);
    },
    close: () => selectGuest(),
    follow() {
      const guest=visitors.guests.get(selectedGuest ?? -1);
      if (following || !guest) {clearGuestFollow();return;}
      if (!cameras.explore) switchMode();
      following=true;cameras.track(guest);updateGuests();
    },
    pace(n) { if (n===0||n===1||n===2||n===4||n===8) guestPace=n; }
  });
  function drawEntrance() {
    const location = entranceDraft ?? resort.business.data.entrance;
    const plan = location && resort.entrancePlan(location);
    entrance.draw(map,location,!!entranceDraft,!plan?.issues.length,plan?.paths.map(x=>x.path));
    businessPanel.draft(entranceDraft ? plan : undefined,resort.funds>=economy.entranceCost,plan?.usable);
    dirty = true;
  }
  function closeEntranceDraft() {
    if (!entranceDraft) return;
    entranceDraft = undefined;
    drawEntrance();
  }
  const businessPanel = bindBusinessPanel(root,{
    place() {
      if (resort.business.data.entrance) return;
      construction.cancel();
      selected = selectedTrail = trailDraft = undefined;
      trails.draft(map,[]);
      updateLiftPanel();
      marker.visible = false;
      entranceDraft = resort.suggestEntrance();
      drawEntrance();
    },
    suggested() { entranceDraft = resort.suggestEntrance(); drawEntrance(); },
    accept() {
      if (!entranceDraft || !resort.buildEntrance(entranceDraft)) return;
      entranceDraft = undefined;
      clearScenery();
      persist();
      businessPanel.show(true);
      businessPanel.update(resort,visitors);
    },
    cancel() { closeEntranceDraft(); businessPanel.show(true); },
    price(value) { if (resort.business.setPrice(value)) checkpoint(); businessPanel.update(resort,visitors); },
    toggle() {
      const changed = resort.business.data.phase === 'open'
        ? resort.business.close() : resort.business.open(visitors.stats().circuits > 0);
      if (changed) checkpoint();
      businessPanel.update(resort,visitors);
    },
    endDay() { if (resort.business.endDay()) checkpoint(); businessPanel.update(resort,visitors); },
    nextDay() { if (resort.business.nextDay()) checkpoint(); businessPanel.update(resort,visitors); }
  });
  drawEntrance();
  businessPanel.update(resort,visitors);
  updateGuests();
  updateSettings = (next,version=map.version) => {
    if (map.seed !== next.seed || map.version !== version) {
      const newSave = beginNewResort(resort, next.seed, () =>
        window.confirm(map.version===version
          ? 'Start a new resort on this seed? This clears this layout and resets funds to $250,000.'
          : 'Switch mountain presets? Your current layout is kept separately.'),
        version
      );
      if (!newSave) return false;
      let nextSave=newSave;
      if (version!==map.version) {
        if (!writeResort(storage,resort.snapshot(),true) && resort.needsNewResortConfirmation()) {
          liftPanel.notice('The current layout could not be saved. Retry switching when browser storage is available.');
          return false;
        }
        const savedPreset=readResort(storage,next.seed,version);
        if (savedPreset.terrainVersion===version && (savedPreset.seed===next.seed || next.seed===map.seed)) nextSave=savedPreset;
        else if (savedPreset.terrainVersion===version && savedPreset.seed!==next.seed && (savedPreset.nextId+savedPreset.nextTrailId>2 || savedPreset.business.entrance || savedPreset.business.day>1) &&
          !window.confirm('The other preset has a layout on another seed. Replace it with this new seed?')) return false;
      }
      for (const id of resort.lifts.keys()) lifts.remove(id);
      for (const id of resort.trails.keys()) trails.remove(id);
      trailDraft = undefined;
      selectedTrail = undefined;
      entranceDraft = undefined;
      trails.draft(map, []);
      mountain.dispose();
      next.seed = nextSave.seed;
      map = generateTerrain(nextSave.seed,nextSave.terrainVersion);
      cameras.setWorldSpan(map.span);
      resort = createResort(map, nextSave);
      for(const lift of resort.lifts.values()) lifts.add(map,lift);
      for(const trail of resort.trails.values()) trails.add(map,trail);
      visitors = createGuestSimulation(map,resort,'opening-day');
      selectGuest();
      people.update(visitors.guests.values(),guestClock);
      construction = createConstruction(map, resort);
      selected = undefined;
      persist();
      mountain = createMountain(map);
      clearScenery();
      scene.add(mountain.group);
      cameras.reset();
      marker.visible = false;
      ui.terrain(map);
      ui.inspect();
      updateLiftPanel();
    }
    visitors.setLimit(economy.guestCap[next.quality]);
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
    if (entranceDraft) {
      if (hit) { entranceDraft = {x:hit.point.x,z:hit.point.z}; drawEntrance(); }
      return;
    }
    if (trailDraft) {
      if (hit) placeTrailPoint({ x: hit.point.x, z: hit.point.z });
      return;
    }
    if (construction.draft) {
      if (hit) construction.place({ x: hit.point.x, z: hit.point.z });
      else construction.miss();
      updateLiftPanel();
      return;
    }
    const guestHit = people.pick(visitors.guests.values(),view,x-rect.left,y-rect.top,
      rect.width,rect.height,ray.ray,hit?.distance ?? Infinity);
    if (guestHit) {
      selectGuest(guestHit.id);
      return;
    }
    const liftHit = ray.intersectObjects(lifts.pickables, false)[0];
    if (liftHit && (!hit || liftHit.distance < hit.distance)) {
      marker.visible = false;
      ui.inspect();
      selectedTrail = undefined;
      selected = liftHit.object.userData.liftId as number;
      updateLiftPanel();
      return;
    }
    const trailHit = hit && [...resort.trails.values()].reverse().find(trail => trail.route.contains(hit.point));
    if (trailHit) {
      selected = undefined;
      selectedTrail = trailHit.id;
      marker.visible = false;
      ui.inspect();
      updateLiftPanel();
      return;
    }
    if (selected !== undefined || selectedTrail !== undefined) {
      selected = selectedTrail = undefined;
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
  }, switchMode, clearGuestFollow);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ui.error('The graphics context was interrupted. Waiting for the browser to restore it.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    ui.error('');
    dirty = true;
  });
  let last = performance.now(), accumulator=0, lastStats=0;
  document.addEventListener('visibilitychange',()=>{
    last=performance.now();accumulator=0;
    if (document.hidden) checkpoint();
  });
  window.addEventListener('pagehide',()=>checkpoint());
  renderer.setAnimationLoop(time => {
    const dt = Math.max(0, (time - last) / 1000);
    last = time;
    if (context.isContextLost() || document.hidden) return;
    accumulator += Math.min(.2, dt)*guestPace;
    const hadGuests = visitors.guests.size > 0;
    let advanced=false;
    while(accumulator>=1/30){
      accumulator-=1/30;guestClock+=1/30;
      visitors.advance(1/30);advanced=true;
    }
    if(advanced) {
      if(selectedGuest!==undefined&&!visitors.guests.has(selectedGuest))selectGuest();
      people.update(visitors.guests.values(),guestClock);
      lifts.animate(resort.lifts.values());
      dirty ||= hadGuests || visitors.guests.size>0 || [...resort.lifts.values()].some(lift=>lift.running);
    }
    if (resort.business.revision !== savedRevision ||
      (time >= nextCheckpoint && ['open','closed','ending'].includes(resort.business.data.phase))) {
      nextCheckpoint = time + 1800;
      checkpoint();
    }
    if (time-lastStats>250) {
      updateGuests(); businessPanel.update(resort,visitors); lastStats=time;
    }
    view = cameras.update(Math.min(.1, dt), map);
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
