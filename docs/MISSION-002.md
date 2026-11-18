# Mission 002 · First Chair

Frostpeak can now operate a small, two-seat fixed-grip chairlift. Choose the **Lifts** tool and tap the lower and upper terminals, or use the two surveyed benches. Review the ghosted alignment and construction cost before confirming. After construction, select a station or tower on the mountain or choose a lift in the resort tools menu to inspect its status and operate it.

On the default surveyed alignment, Chairlift 01 has approximately **495 m of cable per direction**, **127 m of vertical rise**, **five towers**, and **29 chairs**. It costs **$43,493** and leaves **$206,507** of the initial budget. At a modeled 2.3 m/s, the uphill ride takes about 3m 35s and the theoretical capacity is 471 passengers per hour.

## Construction and operation

- The planner checks the whole terminal footprint, map edges, rise, span length, cable clearance, and conflicts with lift corridors. It adds support towers where regular spacing would leave insufficient clearance.
- Chairs follow the same paired rope lines and semicircular terminal turns drawn in the scene. Distance-based spacing stays even, with the two directions running on opposite sides.
- **Stop lift** freezes the positions and **Start lift** resumes movement. Demolition requires confirmation and gives no refund.
- A versioned local save stores the seed, budget, terminal placements, lift configuration, identifiers, status, and the phase captured at the last save. The game reconstructs each cable deterministically. Existing graphics settings still load. Confirming a new seed clears the previous resort and begins with a new $250,000 budget.

## Screenshots

- [Alignment and pricing preview](mission-002/alignment-preview.jpg)
- [The first operating lift in Manage](mission-002/operating-lift.jpg)
- [Parallel lifts in Explore showing chairs, towers, and terminal equipment](mission-002/explore-chairlift.jpg)
- [Two independent lifts in Manage](mission-002/two-lifts.jpg)
- [Mobile construction](mission-002/mobile-construction.jpg)
- [Mobile lift inspector](mission-002/mobile-lift.jpg)

## Verification

- **20 automated tests passed.** Coverage includes valid routes on four seeds, invalid and reversed placements, adaptive tower placement, cable clearance, conflicts, costs, insufficient funds, cancellation, animation continuity and speed, independent lift operations, save/restore, settings compatibility, and seed-change confirmation.
- **Production build passed.** Browser checks loaded the built assets from a repository-style subpath.
- **Desktop Chromium with software WebGL** placed terminals by raycast, rejected an invalid route, adjusted and canceled it without charges, built two lifts, selected actual infrastructure, observed moving and stopped frames, restored the correct independent statuses and funds, and exercised both outcomes of demolition and seed-change confirmation.
- **Touch-emulated Chromium at 390 × 844** pinched during construction without placing a terminal, placed both terminals with terrain taps, confirmed construction, and restored the lift after reload. No browser exceptions, console errors, or failed resource loads were reported in the smoke test.
- The separate, sign-in-protected preview has its own browser storage. The existing GitHub Pages deployment stays on Mission 001.5 pending approval.

## iPhone Safari approval checklist

1. Open the preview, select **Lifts**, and use the two surveyed-bench buttons. Check the translucent line, the displayed cost, and the funds before and after confirming.
2. Start another lift and try tapping a steep face or the same spot twice. Confirm the feedback is legible and the build action is disabled. Pan or pinch before canceling to check that a gesture does not place a terminal.
3. Switch to Explore and zoom in on a terminal. Watch the chairs turn, then stop and restart the lift. Reload and check that the lift and remaining funds return.
4. Open Settings and try a new seed. Cancel once to preserve the lift, then confirm if you want to start a fresh resort. Demolition likewise offers a cancel choice.

Physical Safari, real-device performance, and the private host's signed-in browser session were outside automated testing. The prototype uses rigid rope spans and theoretical capacity. Passenger boarding, operating costs, and revenue are outside this mission. Vite continues to report a bundle-size advisory for the Three.js application.

**Merge recommendation:** Approve after the physical Safari checklist passes.
