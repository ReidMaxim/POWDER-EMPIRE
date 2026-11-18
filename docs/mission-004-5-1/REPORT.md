# Mission 004.5.1 · Connection Rescue

## Reproduction

On Frostpeak Evolution, seed `FROST-001`, build Chairlift 01 from (−170, 406) to (−90, 236) in world meters. A narrow trail from approximately (−83.08, 263.57) to (−144.35, 393.76) is beginner grade. The reviewed build identified Chairlift 01 at both trail endpoints. It returned zero circuits because the lift's lower terminal was 188.31 m from the resort base and its pedestrian check rejected any direct distance over 180 m before sampling the terrain. The steepest sampled segment on that base approach was only 3.65%. Both station-to-trail checks passed under the reviewed code. This reproduces the reported behavior with a deterministic layout. The original iPhone save coordinates were unavailable.

## Repair

The trail panel separates **endpoint links** from **usable circuits**. Drafts and completed trails use the same circuit evaluator as guest admission. It checks the actual lift queue and unload points, guest skill, operation status, and physical transfers. The guest simulation walks the exact validated waypoints for base access, lift-to-trail connections, junctions, and returns. A cached, bounded terrain search can detour around steep sections. Limits are 360 m total for base approaches, 65 m for terminal transfers, and 38 m for trail junctions. The planner retains an uphill and downhill grade limit of about 84% and checks height along each segment at intervals no longer than 2 m.

Teal rings show upper connection zones and gold rings show lower zones during drawing. Gold dots mark anchors outside station and tower clearance. Tap or click within 11 m of an appropriate anchor to snap, or place a waypoint elsewhere. The inspector reports missing access, unsafe transfers, stopped lifts, or closed trail connections. Mobile inspection defaults to the trail name, difficulty, and circuit verdict. Expand for endpoint links and open **Trail measurements** for grade statistics.

Terrain generation, lift alignments, trail control points, and the save format are unchanged. Classic and Evolution retain separate local saves. Existing layouts are re-evaluated on load.

## Tests and manual review

The 42 baseline tests and four new regressions pass. New tests reproduce the 188 m approach, verify snaps for every trail width, test a bounded detour and an impassable ridge, and check circuit explanations, persistence, and a complete beginner guest run. The production build passes.

The local production bundle was served under the GitHub Pages project path. Desktop Chromium constructed Meadow and West Ridge lifts and trails through the normal game controls, followed a beginner through a completed descent, then loaded the branching fixture. The fixture reported seven circuits initially and five after closing its shared return trail. The upstream inspector explained the lost connection. At 390 × 844, touch-emulated Chromium built the Meadow lift and placed both trail endpoints with actual touch events, checked the collapsed inspector, pinched during Follow Guest, and reloaded the save. A second mobile pass followed Guest 01 through riding, skiing and return. Both used software WebGL with no reported JavaScript exceptions or failed resources. The private preview uses the existing review origin. Physical iPhone Safari requires a follow-up. The transfer search uses a coarse 8 m detour grid and can miss an exceptionally narrow passage. Walking budgets and guest skill are gameplay limits. No economy changes are included.

[Connection zones](connection-detail.jpg) · [Usable circuit](usable-circuit.jpg) · [Compact mobile inspector](mobile-circuit.jpg) · [Mobile guest returning](mobile-guest-return.jpg) · [Guest riding](guest-riding.jpg) · [Guest skiing](guest-skiing.jpg) · [Guest returning](guest-return.jpg) · [Branch circuit](branch-circuit.jpg)

On iPhone, reopen the preview with the existing layout and inspect the previously affected trail. Confirm the verdict matches the guest panel. Build a Meadow trail using both marked anchors, follow a beginner guest through a descent, then try pinch and pan with the inspector collapsed. Approve the merge after that check.
