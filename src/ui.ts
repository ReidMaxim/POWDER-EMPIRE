import { BASE_ALTITUDE, terrainTitles, isTerrainVersion, type TerrainVersion, type Heightmap, type TerrainSample } from './terrain';
import type { Preferences, Quality } from './preferences';

type Actions = {
  switchMode(): void;
  rotate(turn: number): void;
  zoom(amount: number): void;
  reset(): void;
  preferences(next: Preferences, version?: TerrainVersion): boolean;
};

export function createUI(root: HTMLElement, preferences: Preferences, actions: Actions) {
  root.innerHTML = `
    <main class="world" aria-label="Interactive ski resort terrain"></main>
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><div><h1>POWDER<span> EMPIRE</span></h1><p>MISSION 004.5 <b> / </b> MOUNTAIN EVOLUTION</p></div></div>
      <div class="status" aria-label="Resort status">
        <span class="prototype" title="Weather and date are prototype values"><i></i> PROTOTYPE</span>
        <div class="stat"><span>FUNDS</span><strong id="resort-funds" aria-live="polite">$250,000</strong></div>
        <div class="stat weather"><span>WEATHER</span><strong>❄ &nbsp;−6 °C</strong></div>
        <div class="stat"><span>RESORT DATE</span><strong>Dec 01 <small>· Day 1</small></strong></div>
      </div>
      <button class="settings icon" type="button" aria-label="Settings" title="Settings">⚙︎</button>
    </header>
    <section class="location" aria-label="Current terrain">
      <div class="eyebrow"><span></span> ALPINE RESERVE</div>
      <h2>Frostpeak</h2>
      <p><span id="mountain-preset"></span> · SEED <strong id="seed-label"></strong></p>
    </section>
    <aside class="inspector panel" id="terrain-panel" aria-labelledby="inspect-title">
      <div class="panel-title"><div><span class="eyebrow">SURVEY TOOL</span><h2 id="inspect-title">Terrain inspector</h2></div><span class="reticle" aria-hidden="true">⌖</span></div>
      <div class="readings" aria-live="polite">
        <div><span>ALTITUDE</span><strong id="altitude">—</strong></div>
        <div><span>SLOPE GRADE</span><strong id="grade">—</strong></div>
      </div>
      <div class="survey-hint" id="survey-hint"><span>⌁</span> Select a point on the mountain</div>
    </aside>
    <aside class="inspector panel lift-panel" id="lift-panel" aria-labelledby="lift-title" hidden>
      <div class="panel-title"><div><span class="eyebrow" id="lift-detail"></span><h2 id="lift-title"></h2></div><button type="button" id="lift-dismiss" aria-label="Close lift panel">×</button></div>
      <div id="lift-build" class="lift-content" hidden>
        <strong id="lift-step"></strong>
        <p id="lift-feedback" role="status"></p>
        <label id="lift-site-field" hidden>Surveyed area <select id="lift-site"></select></label>
        <button type="button" id="lift-surveyed" class="lift-survey"></button>
        <dl id="lift-summary" class="lift-stats" hidden></dl>
        <details class="lift-limits"><summary>Placement limits</summary><p id="lift-limits-text"></p></details>
        <div class="lift-actions"><button type="button" id="lift-back">Back</button><button type="button" id="lift-cancel">Cancel</button><button type="button" id="lift-confirm" class="lift-primary">Confirm</button></div>
      </div>
      <div id="lift-manage" class="lift-content" hidden>
        <p id="lift-status" role="status"></p>
        <dl id="lift-stats" class="lift-stats"></dl>
        <div class="lift-actions"><button type="button" id="lift-toggle" class="lift-primary">Stop lift</button><button type="button" id="lift-demolish">Demolish</button></div>
      </div>
    </aside>
    <aside class="inspector panel lift-panel trail-panel" id="trail-panel" aria-labelledby="trail-title" hidden>
      <div class="panel-title"><div><span class="eyebrow">SKI TRAIL</span><h2 id="trail-title"></h2></div><div class="trail-panel-buttons"><button type="button" id="trail-collapse" aria-label="Toggle trail details" aria-expanded="true">−</button><button type="button" id="trail-close" aria-label="Close trail panel">×</button></div></div>
      <div class="lift-content">
        <div id="trail-editor">
          <strong id="trail-step"></strong>
          <p id="trail-feedback" role="status"></p>
          <label class="trail-width">Width <select id="trail-width"><option value="12">12 m · Narrow</option><option value="20">20 m · Standard</option><option value="30">30 m · Wide</option></select></label>
          <button type="button" id="trail-suggest" class="lift-survey"></button>
          <details class="lift-limits"><summary>Placement and preview</summary><p id="trail-limits"></p></details>
        </div>
        <div class="trail-status-row"><span id="trail-difficulty" hidden></span><strong id="trail-status"></strong></div>
        <dl class="lift-stats" id="trail-metrics"></dl>
        <p id="trail-links"></p><details class="lift-limits" id="trail-grade-details" hidden><summary>Grade distribution</summary><p id="trail-grades"></p></details>
        <div id="trail-manager" hidden>
          <form id="trail-rename"><input id="trail-name" aria-label="Trail name" maxlength="50" required><button type="submit">Rename</button></form>
          <div class="lift-actions"><button type="button" id="trail-toggle" class="lift-primary">Close trail</button><button type="button" id="trail-demolish">Demolish</button></div>
        </div>
        <div class="lift-actions" id="trail-draft-actions"><button type="button" id="trail-undo">Undo</button><button type="button" id="trail-cancel">Cancel</button><button type="button" id="trail-review" class="lift-primary">Review</button><button type="button" id="trail-confirm" class="lift-primary" hidden>Confirm</button></div>
      </div>
    </aside>
    <div id="lift-notice" class="lift-notice panel" role="status" hidden></div>
    <div class="guest-dock">
      <button id="guest-toggle" class="panel" type="button" aria-expanded="false" aria-controls="guest-panel">Guests <b id="guest-population">0</b> ▴</button>
      <section id="guest-panel" class="panel lift-panel" aria-label="Guests and resort activity" hidden>
        <div class="lift-content">
          <p id="guest-empty">No usable ski circuit. Open a lift and connect its upper station to a suitable downhill trail.</p>
          <dl class="lift-stats">
            <div><dt>Waiting</dt><dd id="guest-waiting">0</dd></div><div><dt>Riding</dt><dd id="guest-riding">0</dd></div>
            <div><dt>Skiing</dt><dd id="guest-skiing">0</dd></div><div><dt>Completed runs</dt><dd id="guest-runs">0</dd></div>
            <div><dt>Usable circuits</dt><dd id="guest-circuits">0</dd></div>
            <div><dt><label for="guest-pace">Simulation speed</label></dt><dd><select id="guest-pace"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></dd></div>
          </dl>
          <button id="guest-find" type="button" disabled>Find a guest</button>
          <div id="guest-info" hidden>
            <div class="guest-heading"><strong id="guest-name"></strong><button id="guest-close" type="button" aria-label="Clear guest selection">×</button></div>
            <p><strong id="guest-activity"></strong> · <span id="guest-skill"></span></p><p id="guest-outlook"></p>
            <dl class="lift-stats">
              <div><dt>Lift</dt><dd id="guest-lift"></dd></div><div><dt>Trail</dt><dd id="guest-trail"></dd></div>
              <div><dt>Runs</dt><dd id="guest-own-runs"></dd></div>
            </dl>
            <button id="guest-follow" class="lift-primary" type="button">Follow Guest</button>
          </div>
        </div>
      </section>
    </div>
    <section class="minimap panel" aria-label="Terrain overview">
      <div class="map-title"><span>TOPOGRAPHY</span><span>N ↑</span></div>
      <canvas id="topography" width="144" height="100" aria-label="Seeded elevation overview"></canvas>
      <div class="map-footer"><span>0</span><i></i><span id="map-span">960 m</span></div>
    </section>
    <nav class="build panel" aria-label="Resort construction">
      <div class="build-title"><span>RESORT TOOLS</span><small>FIRST GUESTS</small></div>
      <div class="build-buttons">
        <button type="button" id="lift-tool" aria-pressed="false"><span aria-hidden="true">♢</span>Lifts</button>
        <button type="button" id="trail-tool" aria-pressed="false"><span aria-hidden="true">⌇</span>Trails</button>
        <button disabled><span aria-hidden="true">⌂</span>Lodges</button>
      </div>
      <select id="trail-registry" aria-label="Inspect a built trail" hidden></select>
      <select id="lift-registry" aria-label="Inspect a built lift" hidden></select>
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
      <form method="dialog" class="dialog-title"><div><span class="eyebrow">MOUNTAIN EVOLUTION</span><h2>Settings</h2></div><button aria-label="Close settings" value="close">×</button></form>
      <form id="seed-form">
        <label class="setting-line">Mountain <select id="terrain-version"><option value="classic">Frostpeak Classic</option><option value="evolution">Frostpeak Evolution</option></select></label>
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
  const preset = get<HTMLSelectElement>('terrain-version');
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
    preset.value = terrain?.version ?? 'classic';
    quality.value = preferences.quality;
    trees.checked = preferences.trees;
    motion.checked = preferences.reducedMotion;
    get('seed-label').textContent = preferences.seed;
  };
  const save = (next: Partial<Preferences>, version?: TerrainVersion) => {
    const proposed = { ...preferences, ...next };
    if (actions.preferences(proposed,version)) Object.assign(preferences, proposed);
    sync();
  };
  settingsButton.onclick = () => { sync(); dialog.showModal(); };
  get<HTMLFormElement>('seed-form').onsubmit = event => {
    event.preventDefault();
    if (seed.value.trim()) save({ seed: seed.value.trim() },isTerrainVersion(preset.value)?preset.value:undefined);
  };
  get<HTMLButtonElement>('random').onclick = () => {
    save({ seed: 'SNOW-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase() },isTerrainVersion(preset.value)?preset.value:undefined);
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
    if (terrain?.version==='evolution') {
      mapContext.fillStyle='#ffd39a';
      for(const {lower,upper} of terrain.liftSites) for(const p of [lower,upper]) {
        mapContext.beginPath();
        mapContext.arc((p.x/terrain.span+.5)*mapCanvas.width,(p.z/terrain.span+.5)*mapCanvas.height,p===upper?2:1.5,0,Math.PI*2);
        mapContext.fill();
      }
    }
    if (!point) return;
    mapContext.fillStyle = '#faaf69';
    mapContext.beginPath();
    const span=terrain!.span, half=span/2;
    mapContext.arc((point.x + half) / span * mapCanvas.width, (point.z + half) / span * mapCanvas.height, 3, 0, Math.PI * 2);
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
      const half=map.span/2;
      get('mountain-preset').textContent=terrainTitles[map.version].split(' ')[1];
      get('map-span').textContent=map.span+' m';
      const selector=get<HTMLSelectElement>('lift-site');
      selector.replaceChildren(...map.liftSites.map((site,index)=>new Option(site.name,String(index))));
      get('lift-site-field').hidden=map.liftSites.length<2;
      mapImage = mapContext.createImageData(mapCanvas.width, mapCanvas.height);
      for (let y = 0; y < mapCanvas.height; y++) {
        for (let x = 0; x < mapCanvas.width; x++) {
          const sample = terrain.sample((x / mapCanvas.width * 2 - 1) * half, (y / mapCanvas.height * 2 - 1) * half);
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
