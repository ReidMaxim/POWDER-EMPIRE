# Powder Empire

**Mission 005 · Opening Day**

A ski resort tycoon prototype on a seeded mountain. Survey Frostpeak, build fixed-grip chairlifts, lay out ski trails, and watch guests use the resort. The browser runs the entire project with Three.js, TypeScript, and Vite.

Select **Frostpeak Evolution** in Settings and choose **Generate** to start on the wider mountain. Saves created before terrain versioning open on Frostpeak Classic. Each preset keeps its own local layout. See the [Mountain Evolution mission report](docs/mission-004-5/REPORT.md) for the validated three-lift, eight-trail layout and screenshots.

Open **Resort**, place the surveyed entrance or select another level base site, then build an accessible lift and open ski circuit. Set the day-ticket price and open the resort. Financial details break out revenue, lift expenses, and guest satisfaction. Closing stops admissions and gives current visitors time to leave. The end-of-day report stays open until you advance to the next day. [Opening Day mission report](docs/mission-005/REPORT.md)

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

## Welcome guests

Build an entrance, then connect an operating lift to an open, skill-appropriate trail with a return to a lower terminal or the base. Open the resort and choose **Guests**, select a skier, and choose **Follow Guest**. [Mission 004 report and playtest checklist](docs/MISSION-004.md)
