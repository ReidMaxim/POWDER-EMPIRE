# Mission 004 · First Guests

A usable circuit gives Frostpeak its first guests. Each skier walks from the base to an operating lift, waits in line, boards one of the actual two passenger seats and rides to the upper station. Guests disembark, ski eligible open routes, and return to a lift or the base. The inspector shows the skier's skill, activity, destination and completed runs.

The **Guests** panel shows live arrival, queue, riding and skiing counts, plus completed runs and distinct circuits. **Find a guest** cycles through the active roster. **Follow Guest** opens a close Explore view of that same skier. Orbit and zoom remain available while following. Exit follow restores the prior view controls. The simulation runs at 1× by default, with 2×, 4×, and 8× viewing speeds.

## Simulation and rendering

- Circuit discovery runs when resort infrastructure changes. Routes use actual terminal and trail junction data, require a walkable connection, and require a way back. Guests are admitted only when a compatible circuit exists. Extreme runs are outside the three guest skill levels.
- Each chair uses the same distance and pose information as the lift renderer. FIFO boarding checks the lower boarding point and seat availability. Stop freezes the chair and attached riders. Unloading uses the corresponding upper point on the same cable loop.
- Ski motion follows the sampled trail, adjusts speed using local grade, then eases toward the exit. Carving stays inside the corridor, and elevation comes from the terrain at the skier's horizontal position.
- Procedural skiers use nine shared instanced parts, a jacket palette and simple posture changes. Quality settings cap arrivals at 20, 24, or 32 guests. A bounded 30 Hz simulation step advances guest movement and the original chairs together.
- Guest counts, phases, and the selected simulation speed reset on reload. Resort seed, lifts, trails, operating states, funds and existing graphics preferences continue to use the Mission 003 save. Arrivals never change the balance.

## Verification

- **34 automated tests** cover prior missions and skill filtering, closed or isolated routes, queue order, two occupied seats, per-chair pose agreement, exact pause and resume, unloading, corridor and elevation checks, continuous position changes, and a complete circuit. Additional checks cover demolition, reload and funds.
- Desktop Chromium with software WebGL built the lift and trail through the UI and followed **Guest 01** from the lower queue to the same chair, through a stop and restart, out at the upper terminal, down the trail and back to the lower station. Guest 01 registered **one completed run**. Closing the trail removed the circuit. Reopening it and reloading preserved the two constructions and $188,831 balance.
- Touch-emulated Chromium at 390 × 844 confirmed guest selection by tap, follow and exit, and the two-finger zoom gesture while tracking. The browser checks reported no console errors, JavaScript exceptions, or missing assets.
- Browser checks loaded the production bundle under a GitHub Pages-style subpath. The isolated hosted preview requires ChatGPT sign-in.

## Guest 01's circuit

[Lower queue](mission-004/lower-queue.jpg) · [Paused chair](mission-004/paused-chair.jpg) · [Riding uphill](mission-004/riding-uphill.jpg) · [Upper station unload](mission-004/upper-unload.jpg) · [Skiing downhill](mission-004/skiing-downhill.jpg) · [Returning with one completed run](mission-004/returning-to-lift.jpg) · [Mobile follow](mission-004/mobile-follow.jpg)

## iPhone playtest

1. Build a surveyed chairlift, then make a trail using **Start near upper station** and **Point toward the base**. Confirm the trail is open and the lift is operating.
2. Open **Guests**, wait for an arrival, then choose **Find a guest** and **Follow Guest**. You can also tap a moving skier directly. For quicker viewing, choose 4×. Return to 1× to watch loading and unloading.
3. Stop the lift from its inspector while your guest is aboard. Check that the guest remains on the seat. Restart and follow through unloading, the downhill run and the return to the lower lift or base.
4. Exit follow and try pinch, orbit and terrain taps. Close the only trail and check that the circuit count falls to zero and new admissions stop. Reload and verify the lift, trail and budget persisted.

## Limits

Direct station approaches are checked against terrain but use straight walkable links with no crowd or obstacle avoidance. Shared seats are simplified procedural poses. Guests on removed infrastructure are retired after settling rather than being transported elsewhere. Elevation and distance connection limits may exclude remote construction from autonomous service. Physical Safari, hardware performance and signed-in hosted gameplay need manual review. Vite retains its bundle-size advisory.

**Merge recommendation:** Approve after completing the iPhone playtest.
