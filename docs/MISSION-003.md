# Mission 003 · Fresh Tracks

Frostpeak now supports ropeway-connected ski trails. Open **Trails**, tap downhill waypoints, choose a width, and review the route before paying. **Undo** removes a point, **Back** returns from review, and **Cancel** leaves the resort unchanged. The trail panel can collapse while keeping the draft available. The two endpoint shortcuts help place a run beside an existing lift or between the surveyed benches.

A confirmed run creates terrain-conforming snow, groomer lines, edge markers and colored signs. The terrain heightmap stays unchanged. A light centerline helps locate trails in Manage. Explore hides it unless the trail is selected. Tap the snow within a run or select it in the trail directory to inspect it, rename it, change its open status, or demolish it after confirmation.

## Terrain, forestry, and routes

- Quadratic corner rounding preserves endpoints and supports winding descents. The centerline is sampled approximately every 2.25 m; the groomed mesh is clipped to the heightmap's real triangle edges before draping the surface.
- Length is horizontal centerline distance. Average grade is net drop divided by that length, expressed as a percentage. The rating uses the steepest representative 18 m interval. The inspector also shows the grade distribution and raw maximum so small spikes remain visible without directly setting the rating.
- A draft flags sustained climbs, unsafe side slopes, cliffs, boundary encroachment and obstructions at stations or towers. Overhead cables can cross a run when the route clears the tower bases.
- Orange dots show which conifer centers fall inside the proposed clearing. The runtime combines every completed trail footprint with existing lift exclusions and retains the original seeded instance buffers. Demolishing a trail restores only trees outside all remaining clearings.
- The trail network stores directed links from runs to neighboring endpoints. It also records lift IDs and the resort base. An open chain can connect an upper lift station to a return terminal or the base. Closing an intermediate run removes it from indirect connections.
- Construction costs $1,000 plus $2 per square meter of nominal corridor and $12 per newly cleared conifer. The version 2 resort save migrates existing chairlifts, balances and operating phases from Mission 002. A seed change after construction requires confirmation before creating a fresh resort.

## Verification

- **29 automated tests** cover existing terrain and lifts plus rounded route sampling, terrain-triangle clipping, widths, grade bands, sustained hazards, protected infrastructure, network links across seeds, overlapping clearings, costs, migration, and persistence.
- **Production build** and browser checks use the built bundle at a GitHub Pages-style subpath.
- On the desktop reference run, a 30 m trail measured **441 m** with a **127 m** drop. It was rated **Advanced** at **47%** over the steepest 18 m, compared with **29%** average grade. Its **$27,485** cost included **two conifers**. The preview was connected to Chairlift 01 at both ends.
- Desktop checks included mouse placement, dragging while editing, invalid reverse placement, cancellation, multiple points, width changes, review and Back, named-run inspection, reopen, reload and demolition. In the sampled screenshot region, forest-colored pixels went from 1,687 before construction to 1,431 after construction and back to 1,687 after demolition. The chairlift remained active and saved with the trail.
- Touch-emulated Chromium at 390 × 844 verified that pinching added no waypoints, terrain taps drew the route, and confirmation and reload retained it. The desktop and touch smoke tests reported no JavaScript errors or missing assets. Physical iPhone Safari and hardware performance require manual testing. The independent preview uses browser storage on its own origin. Signed-in browser gameplay on the private host was outside the automated smoke test.

## Screenshots

- [Forest before construction](mission-003/forest-before.jpg)
- [Width, grade, cost and lift connections in the preview](mission-003/construction-preview.jpg)
- [Completed run and inspector in Manage](mission-003/managed-trail.jpg)
- [Groomed surface alongside the operating lift in Explore](mission-003/explore-trail.jpg)
- [Mobile trail inspection](mission-003/mobile-trail.jpg)

## iPhone Safari checklist

1. Build a lift using its surveyed benches. Open **Trails** and select **Start near upper station**.
2. Tap two or three downhill points beside the lift. Pinch and pan with two fingers between taps and check that the waypoint count changes only for taps. Expand trail details as needed.
3. Use **Point toward the base**, choose a width, and review grade, cost and connections. Confirm when the draft is valid. Inspect the groomed run in Explore.
4. Rename and close the trail, reload, and verify the name, status, balance and lift. Reopen it, then demolish it and check that eligible trees return without a refund.

The terrain bands and connection radii are prototype planning rules. Junctions infer proximity and elevation compatibility; skier movement, snow deformation, and historical forest regrowth are outside this mission. The build retains the existing bundle-size advisory.

**Merge recommendation:** Approve after the iPhone checklist passes.
