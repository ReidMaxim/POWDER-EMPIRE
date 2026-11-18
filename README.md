# Powder Empire

**Mission 001 · First Snow**

A standalone browser prototype for surveying a procedural ski resort. Explore Frostpeak, compare slope grades, and regenerate the mountain from a seed. The browser runs the entire project with Three.js, TypeScript, and Vite.

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

Push this project as the root of a standalone repository on `main`. In **Settings → Pages**, set **Source** to **GitHub Actions**. Run **Deploy Powder Empire** from the Actions tab if the initial push happened before Pages was configured. The job runs the terrain tests and build, publishes `dist`, and reports the public URL in the `github-pages` environment. Vite uses relative asset paths so both project subpaths and root domains work.

Once the job succeeds, open its Pages URL in a fresh browser session, check both camera modes and terrain inspection, and confirm the browser can load the production assets. [Verification and screenshots](docs/MISSION-001.md)

## Project structure

- `src/terrain.ts` owns the seeded heightmap, grid dimensions, and read-only sampling interface. The renderer and future gameplay can share the same world coordinates and grade calculations.
- `src/environment.ts` builds the terrain mesh, instanced forest and rocks, lighting, and fog. All scene graphics are original procedural geometry or locally generated textures.
- `src/cameras.ts` and `src/controls.ts` handle camera motion, transitions, and keyboard, pointer, and touch input.
- `src/ui.ts` and `src/style.css` provide the HUD, inspector, map, and settings.
- `src/preferences.ts` loads and saves browser settings.
- `src/main.ts` wires the modules into the renderer and performs terrain raycasts.

Build tools and tycoon values are placeholders for later missions.
