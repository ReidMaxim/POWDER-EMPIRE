# Powder Empire

**Mission 003 · Fresh Tracks**

A ski resort tycoon prototype on a seeded mountain. Survey Frostpeak, build fixed-grip chairlifts and plan connected ski trails. The browser runs the entire project with Three.js, TypeScript, and Vite.

## Run locally

Use Node.js 24 and a browser with WebGL 2.

```sh
npm ci
npm run dev
```

For a production build and preview:

```sh
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. Serve the built files over HTTP; browsers restrict JavaScript module loading from local file URLs.

## Controls

| Action | Manage | Explore |
| --- | --- | --- |
| Drag | Pan | Orbit |
| Shift-drag or secondary-button drag | Pan | Pan |
| Wheel or pinch | Zoom | Zoom |
| Two-finger drag | Pan | Pan |
| Click or tap terrain | Inspect altitude and slope grade | Inspect altitude and slope grade |
| Q / E | Rotate 90° | Rotate 90° |
| Arrow keys | Pan | Pan |
| V | Switch views | Switch views |
| Home | Reset view | Reset view |

Settings persist the terrain seed, render quality, conifer visibility, and reduced-motion preference in browser storage. Altitude uses a 1,250 m datum. Slope grade is rise divided by horizontal distance, expressed as a percentage.

## Deploy to GitHub Pages

Push this project as the root of a standalone repository on `main`. In **Settings → Pages**, set **Source** to **GitHub Actions**. Run **Deploy Powder Empire** from the Actions tab if the initial push happened before Pages was configured. The job runs the automated tests and build, publishes `dist`, and reports the public URL in the `github-pages` environment. Vite uses relative asset paths so both project subpaths and root domains work.

Once the job succeeds, open its Pages URL in a fresh browser session, check both camera modes and terrain inspection, and confirm the browser can load the production assets. [Verification and screenshots](docs/MISSION-001.md)

## Project structure

- `src/terrain.ts` owns the seeded heightmap, grid dimensions, and read-only sampling interface. The renderer and future gameplay can share the same world coordinates and grade calculations.
- `src/environment.ts` builds the terrain mesh, instanced forest and rocks, lighting, and fog. All scene graphics are original procedural geometry or locally generated textures.
- `src/cameras.ts` and `src/controls.ts` handle camera motion, transitions, and keyboard, pointer, and touch input.
- `src/ui.ts` and `src/style.css` provide the HUD, inspector, map, and settings.
- `src/preferences.ts` loads and saves browser settings.
- `src/main.ts` wires the modules into the renderer and performs terrain raycasts.

## Build your first lift

Select **Lifts**, then pick a lower and an upper point on the snow. You can also use the two surveyed-bench buttons. Review the alignment and price, then select **Confirm**. Tap a terminal or choose a lift from the tools menu to inspect, start, stop, or demolish it.

The resort starts with $250,000. Construction spends funds once. Demolition gives no refund. The budget and lifts persist locally with the terrain seed. Changing the seed after construction requires confirming a new resort.

Lift planning, simulation, save data and rendering are in `src/lifts/`. [Mission 002 report and playtest checklist](docs/MISSION-002.md)

[Mission 001.5 terrain and camera notes](docs/MISSION-001-5.md)

## Draw a ski trail

Open **Trails**, tap a start and downhill waypoints, then choose a width and review. Select a finished run on the snow or in the trail directory to manage it. [Fresh Tracks report and iPhone checklist](docs/MISSION-003.md)
