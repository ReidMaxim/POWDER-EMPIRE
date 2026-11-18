import type { Heightmap } from '../terrain.ts';
import { checkStation, type GroundPoint, type Proposal } from './alignment.ts';
import type { createResort } from './resort.ts';

export type Draft = { lower?: GroundPoint; upper?: GroundPoint; invalidLower?: GroundPoint; proposal: Proposal };

export function createConstruction(map: Heightmap, resort: ReturnType<typeof createResort>) {
  let draft: Draft | undefined;
  return {
    get draft() { return draft; },
    start() { draft = { proposal: { issues: [] } }; },
    cancel() { draft = undefined; },
    back() {
      if (!draft) return;
      if (draft.upper) draft = { lower: draft.lower, proposal: { issues: [] } };
      else this.start();
    },
    place(point: GroundPoint) {
      if (!draft) return;
      if (draft.lower) {
        draft = { lower: draft.lower, upper: point, proposal: resort.propose(draft.lower, point) };
        return;
      }
      const issue = checkStation(map, point);
      draft = issue ? { invalidLower: point, proposal: { issues: [issue] } } : { lower: point, proposal: { issues: [] } };
    },
    miss() {
      // A missed ray never drops a valid terminal or changes the world.
      if (draft && (!draft.proposal.alignment || draft.proposal.issues.length)) {
        draft.proposal = { issues: ['Tap or click the snow surface to place a terminal.'] };
      }
    },
    confirm() {
      if (!draft?.lower || !draft.upper) return;
      const result = resort.construct(draft.lower, draft.upper);
      if (result.lift) this.cancel();
      else draft.proposal = resort.propose(draft.lower, draft.upper);
      return result.lift;
    }
  };
}
