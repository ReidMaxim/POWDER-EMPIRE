import { BASE_ALTITUDE, HALF, type Heightmap, type TerrainSample } from './terrain';
import type { Preferences, Quality } from './preferences';

type Actions = {
  switchMode(): void;
  rotate(turn: number): void;
  zoom(amount: number): void;
  reset(): void;
  preferences(next: Preferences): void;
};

export function createUI(root: HTMLElement, preferences: Preferences, actions: Actions) {
  root.innerHTML = `
    <main class="world" aria-label="Interactive ski resort terrain"></main>
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><div><h1>POWDER<span> EMPIRE</span></h1><p>MISSION 001 <b> / </b> FIRST SNOW</p></div></div>
      <div class="status" aria-label="Prototype UI">
        <span class="prototype"><i></i> PROTOTYPE UI</span>
        <div class="stat"><span>FUNDS</span><strong>$250,000</strong></div>
        <div class="stat weather"><span>WEATHER</span><strong>❄ &nbsp;−6 °C</strong></div>
        <div class="stat"><span>RESORT DATE</span><strong>Dec 01 <small>· Day 1</small></strong></div>
      </div>
      <button class="settings icon" type="button" aria-label="Settings" title="Settings">⚙︎</button>
    </header>
    <section class="location" aria-label="Current terrain">
      <div class="eyebrow"><span></span> ALPINE RESERVE</div>
      <h2>Frostpeak</h2>
      <p>SEED <strong id="seed-label"></strong></p>
    </section>
    <aside class="inspector panel" aria-labelledby="inspect-title">
      <div class="panel-title"><div><span class="eyebrow">SURVEY TOOL</span><h2 id="inspect-title">Terrain inspector</h2></div><span class="reticle" aria-hidden="true">⌖</span></div>
      <div class="readings" aria-live="polite">
        <div><span>ALTITUDE</span><strong id="altitude">—</strong></div>
        <div><span>SLOPE GRADE</span><strong id="grade">—</strong></div>
      </div>
      <div class="survey-hint" id="survey-hint"><span>⌁</span> Select a point on the mountain</div>
    </aside>
    <section class="minimap panel" aria-label="Terrain overview">
      <div class="map-title"><span>TOPOGRAPHY</span><span>N ↑</span></div>
      <canvas id="topography" width="144" height="100" aria-label="Seeded elevation overview"></canvas>
      <div class="map-footer"><span>0</span><i></i><span>960 m</span></div>
    </section>
    <nav class="build panel" aria-label="Resort construction">
      <div class="build-title"><span>RESORT TOOLS</span><small>COMING SOON</small></div>
      <div class="build-buttons">
        <button disabled><span aria-hidden="true">♢</span>Lifts</button>
        <button disabled><span aria-hidden="true">⌇</span>Trails</button>
        <button disabled><span aria-hidden="true">⌂</span>Lodges</button>
      </div>
    </nav>
    <section class="camera-controls panel" aria-label="Camera controls">
      <div class="mode-row">
        <button id="management" type="button" aria-pressed="true"><span aria-hidden="true">▱</span> Manage</button>
        <button id="explore" type="button" aria-pressed="false"><span aria-hidden="true">◈</span> Explore</button>
        <kbd>V</kbd>
      </div>
      <div class="camera-row">
        <button id="rotate-left" type="button" aria-label="Rotate left" title="Rotate left (Q)">↶</button>
        <button id="rotate-right" type="button" aria-label="Rotate right" title="Rotate right (E)">↷</button>
        <button id="zoom-out" type="button" aria-label="Zoom out" title="Zoom out">−</button>
        <button id="zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
        <button id="reset" type="button" aria-label="Reset view" title="Reset view (Home)">⌖</button>
      </div>
      <p id="camera-hint">Drag to pan · Scroll to zoom</p>
    </section>
    <dialog class="panel settings-dialog">
      <form method="dialog" class="dialog-title"><div><span class="eyebrow">FIRST SNOW</span><h2>Settings</h2></div><button aria-label="Close settings" value="close">×</button></form>
      <form id="seed-form">
        <label for="seed">Terrain seed</label>
        <div class="seed-actions"><input id="seed" name="seed" maxlength="40" required><button type="submit">Generate</button></div>
        <button id="random" type="button">Randomize seed</button>
      </form>
      <label class="setting-line">Rendering quality <select id="quality"><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option></select></label>
      <label class="setting-line">Show conifers <input id="trees" type="checkbox"></label>
      <label class="setting-line">Reduce camera motion <input id="motion" type="checkbox"></label>
    </dialog>
    <div class="error panel" hidden role="alert"></div>
  `;
  const get = <E extends HTMLElement>(id: string) => root.querySelector<E>('#' + id)!;
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const seed = get<HTMLInputElement>('seed'), quality = get<HTMLSelectElement>('quality');
  const trees = get<HTMLInputElement>('trees'), motion = get<HTMLInputElement>('motion');
  const manage = get<HTMLButtonElement>('management'), explore = get<HTMLButtonElement>('explore');
  const mapCanvas = get<HTMLCanvasElement>('topography');
  const mapContext = mapCanvas.getContext('2d')!;
  let terrain: Heightmap | undefined;
  let point: { x: number; z: number } | undefined;
  let exploring = false;
  const touch = matchMedia('(pointer: coarse)');
  const cameraHint = get('camera-hint');
  const updateCameraHint = () => {
    if (touch.matches) {
      cameraHint.textContent = exploring ? 'Drag to orbit · 2 fingers to pan · Pinch to zoom' : 'Drag to pan · Pinch to zoom';
    } else {
      cameraHint.textContent = exploring ? 'Drag to orbit · Shift + drag to pan' : 'Drag to pan · Scroll to zoom';
    }
  };
  touch.addEventListener('change', updateCameraHint);
  updateCameraHint();
  let mapImage: ImageData | undefined;
  const settingsButton = root.querySelector<HTMLButtonElement>('.settings')!;
  const sync = () => {
    seed.value = preferences.seed;
    quality.value = preferences.quality;
    trees.checked = preferences.trees;
    motion.checked = preferences.reducedMotion;
    get('seed-label').textContent = preferences.seed;
  };
  const save = (next: Partial<Preferences>) => {
    Object.assign(preferences, next);
    sync();
    actions.preferences(preferences);
  };
  settingsButton.onclick = () => { sync(); dialog.showModal(); };
  get<HTMLFormElement>('seed-form').onsubmit = event => {
    event.preventDefault();
    if (seed.value.trim()) save({ seed: seed.value.trim() });
  };
  get<HTMLButtonElement>('random').onclick = () => {
    save({ seed: 'SNOW-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase() });
  };
  quality.onchange = () => save({ quality: quality.value as Quality });
  trees.onchange = () => save({ trees: trees.checked });
  motion.onchange = () => save({ reducedMotion: motion.checked });
  manage.onclick = () => { if (exploring) actions.switchMode(); };
  explore.onclick = () => { if (!exploring) actions.switchMode(); };
  get('rotate-left').onclick = () => actions.rotate(-1);
  get('rotate-right').onclick = () => actions.rotate(1);
  get('zoom-in').onclick = () => actions.zoom(-.23);
  get('zoom-out').onclick = () => actions.zoom(.23);
  get('reset').onclick = actions.reset;
  const drawMap = () => {
    if (!mapImage) return;
    mapContext.putImageData(mapImage, 0, 0);
    if (!point) return;
    mapContext.fillStyle = '#faaf69';
    mapContext.beginPath();
    mapContext.arc((point.x + HALF) / (HALF * 2) * mapCanvas.width, (point.z + HALF) / (HALF * 2) * mapCanvas.height, 3, 0, Math.PI * 2);
    mapContext.fill();
  };
  sync();
  return {
    world: root.querySelector<HTMLElement>('.world')!,
    dialog,
    mode(active: boolean) {
      exploring = active;
      manage.setAttribute('aria-pressed', String(!active));
      explore.setAttribute('aria-pressed', String(active));
      updateCameraHint();
    },
    terrain(map: Heightmap) {
      terrain = map;
      mapImage = mapContext.createImageData(mapCanvas.width, mapCanvas.height);
      for (let y = 0; y < mapCanvas.height; y++) {
        for (let x = 0; x < mapCanvas.width; x++) {
          const sample = terrain.sample((x / mapCanvas.width * 2 - 1) * HALF, (y / mapCanvas.height * 2 - 1) * HALF);
          const level = Math.min(sample.elevation / 540, 1);
          const contour = sample.elevation % 54 < 6 ? 25 : 0;
          mapImage.data.set([32 + level * 151 + contour, 64 + level * 135 + contour, 68 + level * 120 + contour, 255], (y * mapCanvas.width + x) * 4);
        }
      }
      drawMap();
    },
    inspect(sample?: TerrainSample & { x: number; z: number }) {
      point = sample;
      get('altitude').textContent = sample ? Math.round(sample.elevation + BASE_ALTITUDE).toLocaleString('en-US') + ' m' : '—';
      get('grade').textContent = sample ? Math.round(sample.grade) + '%' : '—';
      get('survey-hint').textContent = sample ? `⌁  X ${Math.round(sample.x)} m  /  Z ${Math.round(sample.z)} m` : '⌁  Select a point on the mountain';
      drawMap();
    },
    error(message: string) {
      const error = root.querySelector<HTMLElement>('.error')!;
      error.textContent = message;
      error.hidden = !message;
    }
  };
}
