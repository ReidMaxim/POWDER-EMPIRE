# Mission 004.5 · Mountain Evolution

First Guests was merged and published as commit `67733e0`. Mountain Evolution is staged on `mission-004-5-mountain-evolution` for manual review.

## Terrain and resort feasibility

Frostpeak Evolution spreads development over a 1,344 m square, compared with Classic’s 960 m square. Both use a 256 × 256 heightmap and a 130,050-triangle terrain surface. Meadow serves lower beginner runs. West Ridge pairs a broad intermediate face with two routes that branch and rejoin. East Bowl reaches higher into advanced terrain beneath the exposed ridges. The lift tool offers surveyed lower and upper sites in each area, and players can place their own stations.

For seed `FROST-001`, an 8 m sampling grid across the development area (x −380 to 380 m, z −270 to 325 m) found the following areas. Grade is vertical rise divided by horizontal distance. Contiguous areas use four-neighbor grid connectivity. Actual trail difficulty also accounts for sustained steep sections.

| Terrain grade | Total sampled area | Largest connected region |
| --- | ---: | ---: |
| Beginner (0–25%) | 159,040 m² | 140,032 m² |
| Intermediate (>25–40%) | 74,752 m² | 55,424 m² |

The scripted layout uses the normal construction validators, real lift clearances, seeded forest clearing costs and the standard $250,000 budget. The default layout costs $202,182 and fits three chairlifts and eight trails. It offers two beginner Meadow circuits, three West Ridge circuits accessible to intermediate guests, and two advanced East Bowl circuits. The two West Ridge branches converge before West Return. Across five seeds, all three lifts and eight trails fit the starting budget, the routing system found seven alternatives for an advanced guest, and beginner, intermediate and advanced guests completed descents served by the Meadow, West Ridge and East Bowl lifts respectively. The default simulation logged 99 completed trail segments in approximately 867 simulated seconds. The layout is a test fixture. Resorts open with the player's own construction.

## Saves and performance

A byte-level SHA-256 regression pins the Classic default heightmap to Mission 004. Version 1 and 2 saves migrate to Classic. The tests rebuilt a Classic lift and trail without changing their saved records and confirmed the guest circuit still exists. Settings lets players switch between presets and retains a separate local layout for each preset. Changing a preset’s seed asks for confirmation when it would replace construction. A browser preview has its own storage origin. Open production to access production saves.

In a warm Node benchmark on this workspace, the median across 15 terrain generations was approximately 88 ms for Classic and 92 ms for Evolution. Median Three.js mesh and instance preparation was approximately 94 ms and 65 ms in the same run. These are CPU timings and vary with the device. The expanded footprint keeps the terrain triangle count and the instancing approach. The larger spacing between grid points reduces fine terrain detail.

## Browser and build checks

All 42 automated tests pass, and TypeScript and Vite build successfully. Desktop Chromium using software WebGL verified the production bundle at the GitHub Pages subpath. The run exercised migration, restoring both presets, constructing all three lifts through the survey controls, running the fixture with guests, following a beginner through a descent, and reloading the network. At 390 × 844, touch-emulated Chromium exercised tapping, two-finger pinch and Follow Guest. The browser reported no JavaScript errors or failed resource requests. Vite emits its chunk-size advisory for the Three.js bundle (about 168 kB gzip).

Ready for manual review. Merge after the physical iPhone playtest.

## iPhone playtest

1. Open the private preview while signed in. In Settings, choose **Frostpeak Evolution**, select **Generate**, then close the dialog.
2. Tap **Lifts**, choose **Meadow** in the surveyed-area menu, use the surveyed lower and upper station buttons, then confirm. Repeat for West Ridge and East Bowl.
3. Lay two routes from near the same upper station and connect them to a returning trail. Start on Meadow to confirm that a beginner run admits guests. Open **Guests** and try **Follow Guest**.
4. Pinch and pan in Explore, tilt upward near the base, reload, then switch back to Classic and check that the earlier preset's layout is still there.

Physical iPhone Safari frame rate and touch behavior require manual review. The prototype elevation bands are planning heuristics. Only one save slot per preset is retained locally. Browser storage limits and private sessions can affect persistence.

## Screenshots

[Classic overview](classic.jpg) · [Evolution overview](evolution.jpg) · [Meadow survey](meadow.jpg) · [West Ridge survey](west-ridge.jpg) · [East Bowl survey](east-bowl.jpg) · [Three lifts and eight trails](network-side.jpg) · [West Ridge branch](west-branch.jpg) · [Explore](explore.jpg) · [Guest riding](guest-riding.jpg) · [Guest skiing](guest-skiing.jpg) · [Completed descent](guest-return.jpg) · [Mobile follow](mobile-follow.jpg)
