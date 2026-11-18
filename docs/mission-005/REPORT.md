# Mission 005 · Opening Day

## Build and operate

Open **Resort**, then **Place entrance**. The preview starts at a surveyed base site. Tap another plot to inspect it, or use **Surveyed site** to return to the suggested location. Construction costs $3,500. The station footprint and plaza must fit on gentle ground. The preview checks terrain and infrastructure and shows safe approaches to existing lifts. Build an operating lift with a returning trail, set a day ticket, and choose **Open resort**.

Guests appear at the entrance plaza and walk the verified route to the lift queue. Routes account for snow grade and the footprints of stations, towers, and the entrance. They can serve several lifts, and the guest system revalidates them after construction, closure, or demolition. With no usable circuit, the resort explains the access problem and admits nobody.

The resort sells one ticket per successful admission. The default is $45 and the range is $10–$150. Demand increases with usable ski circuits, difficulty variety, and reputation, and falls with price. A premium above $85 has an additional demand penalty. Arrival opportunities are capped by seat throughput, queue and guest limits, and the operating schedule. Guest inspection shows the paid price, satisfaction, and the latest reason for a change. Satisfaction responds to long approaches, ticket value, lift queues, stopped lifts, and completed runs. The daily score adjusts the reputation used for future demand.

The day runs from 09:00 to 16:00. One simulation second represents one resort minute. Pause and the existing simulation speeds also apply to finance. At closing, new admissions stop and riders can finish. A manual closing can resume the same day or end it early. The financial summary waits for the remaining guests to depart. Choose **Next day** to continue. There is no unattended rollover.

Running lifts cost $14 per hour plus $0.063 per meter of uphill length and $0.58 per chair, rounded to the nearest dollar for the hourly rate. During closing, only operating lifts with riders are charged. Stopped lifts have no standing expense. Expenses use simulation time, skip hidden-tab time, and cannot overdraw cash. Low cash automatically closes admissions. There is no automatic loan. If a lift is stopped with passengers during closing, restart it so they can leave. The daily net covers operations. Construction is a separate cash outflow.

## Economic balance

The simulation ran each layout for three days at each price. Cells show the range of daily admissions and net operating income across the three days. Medium used `north:raven`. Small and developed used `FROST-001`. These are gameplay scenarios, not revenue projections.

| Resort | $15 | $45 | $150 |
| --- | --- | --- | --- |
| One lift, one trail | 29 / +$107 to +$113 | 22–23 / +$668 to +$708 | 1 / −$116 |
| Two lifts, six trails | 32–34 / −$553 to −$509 | 30 / +$331 to +$358 | 3 / −$278 |
| Three lifts, eight trails | 32–33 / −$1,389 to −$1,055 | 30–31 / −$345 to −$282 | 5 / −$1,108 to −$642 |

The developed layout earned **$324–$508** at **$75**, with 29 admissions per day. This makes expanding and pricing meaningful. The same default price is profitable for the small resort and insufficient for the three-lift scenario.

## Saves and validation

Version 4 adds the entrance, day and clock, ticket price, operating status, daily ledger, reputation, and fractional expenses. Legacy saves retain their funds and construction and start with a closed resort that needs an entrance. Both terrain presets keep separate layouts. Reload restores the ledger and clock without charging historical admissions again. Active guest positions reset; their last recorded ratings, paid admissions, and run totals are retained.

All 46 baseline tests and six new operating-economy tests pass. The new tests cover entrance placement, obstacle-aware access, paid arrival coordinates, closure with a rider aboard, lift costs and time scaling, save migration, and three-day balance across multiple resort sizes and seeds. TypeScript and Vite production build checks passed.

## Desktop and mobile browser checks

Chromium exercised the production bundle at the GitHub Pages project path using software WebGL. Desktop construction used the normal game controls to establish the entrance, Meadow lift, and beginner trail. The run showed a paying guest at the plaza, later skiing and completing a run, and expenses accumulating. A restored operating-day checkpoint crossed 16:00, presented 22 admissions, $990 revenue, $266 expenses, and the latest satisfaction rating, then advanced to Day 2 on request. A separate browser comparison at about 09:55 sold five, three, and one ticket at $15, $45, and $150 respectively on the same resort layout. Touch-emulated Chromium at 390 × 844 built the entrance, lift, and trail with touch, set a $55 ticket, followed a paying guest while pinching the camera, then closed and reloaded with the price, funds, ledger, and construction intact.

## Screenshots

[Entrance placement](entrance-preview.jpg) · [Guest arriving at the entrance](entrance-arrival.jpg) · [Guest skiing](operating-skiing.jpg) · [Operating dashboard](operating-dashboard.jpg) · [End-of-day report](day-report.jpg) · [Mobile dashboard](mobile-dashboard.jpg) · [Mobile guest inspection](mobile-paying-guest.jpg)

## iPhone review

1. Open the signed-in preview. Choose **Frostpeak Evolution** in Settings and generate it. The preview browser origin has its own local save.
2. Place the surveyed entrance. Build the Meadow lift and a connected beginner run, then set a $45 ticket and open the resort.
3. Follow a guest from the plaza through a downhill run. Pinch and pan in Explore, collapse the dashboard, then reload. Confirm the saved entrance, price and accounts.
4. Close admissions or accelerate to 16:00. Check that riders finish, expenses appear, the report reconciles, and the next day starts only when requested.

Physical iPhone Safari remains a manual check. Software WebGL tests do not measure phone frame rate. Current guest positions are session-only, the planner may miss unusually narrow passages, and one entrance is supported per resort.
