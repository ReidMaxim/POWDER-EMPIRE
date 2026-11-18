import type { GroundPoint } from '../lifts/alignment';
import type { createResort } from '../lifts/resort';
import type { BuiltTrail, TrailConnections } from './network';
import { TRAIL, type TrailRoute, type TrailWidth } from './route';
import { trailColors } from './render';
import type { ConnectionZone } from './anchors';

export interface TrailDraft {
  points: GroundPoint[];
  width: TrailWidth;
  reviewing: boolean;
  plan?: ReturnType<ReturnType<typeof createResort>['proposeTrail']>;
  message?: string;
  zones?: ConnectionZone[];
  snap?: string;
  snappedPoint?: GroundPoint;
}
interface Actions {
  start(): void; close(): void; undo(): void; review(): void; confirm(): void; suggested(): void;
  width(width: TrailWidth): void; select(id: number): void; rename(name: string): void; toggle(): void; demolish(): void;
}
const dollars = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const pct = (n: number) => Math.round(n) + '%';
function displayStats(route: TrailRoute, cost: number, draft: boolean) {
  const fields = [
    ['Length', Math.round(route.length) + ' m'], ['Drop', Math.round(route.drop) + ' m'],
    ['Avg. grade', pct(route.average)], ['Steepest 18 m', pct(route.maximum)],
    ['Width', route.width + ' m'], ['Cost', dollars.format(cost)]
  ];
  if (draft) fields.push(['Conifers to clear', String(route.treeCount)]);
  return fields.map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('');
}

function links(connection: TrailConnections, resort: ReturnType<typeof createResort>) {
  const lifts = (ids: number[]) => ids.map(id => resort.lifts.get(id)?.name).filter(Boolean).join(', ');
  return [
    connection.state === 'Isolated' ? 'No endpoint links' : 'Endpoint links', lifts(connection.reachableUpperLiftIds) && 'Upper: ' + lifts(connection.reachableUpperLiftIds),
    lifts(connection.reachableLowerLiftIds) && 'Lower: ' + lifts(connection.reachableLowerLiftIds),
    connection.returnsToBase && 'Resort base',
    !connection.returnsToBase && !connection.reachableLowerLiftIds.length && 'No return to base or lift', connection.incomingTrailIds.length > 0 && `${connection.incomingTrailIds.length} incoming run(s)`,
    connection.outgoingTrailIds.length > 0 && `${connection.outgoingTrailIds.length} outgoing run(s)`
  ].filter(Boolean).join(' · ');
}

export function bindTrailPanel(root: HTMLElement, actions: Actions) {
  const get = <E extends HTMLElement>(id: string) => root.querySelector<E>('#' + id)!;
  const tool = get('trail-tool'), panel = get('trail-panel'), terrain = get('terrain-panel');
  const collapse = get<HTMLButtonElement>('trail-collapse');
  const compactDefault = matchMedia('(max-width: 690px)');
  let compact = false;
  let mode = '';
  function showDetails(expanded: boolean) {
    compact = !expanded;
    panel.classList.toggle('trail-compact', compact);
    collapse.setAttribute('aria-expanded', String(expanded));
    collapse.textContent = expanded ? '−' : '+';
  }
  collapse.onclick = () => showDetails(compact);
  const registry = get<HTMLSelectElement>('trail-registry');
  const form = get<HTMLFormElement>('trail-rename');
  const name = get<HTMLInputElement>('trail-name');
  const width = get<HTMLSelectElement>('trail-width');
  const confirm = get<HTMLButtonElement>('trail-confirm');
  const undo = get<HTMLButtonElement>('trail-undo');
  const review = get<HTMLButtonElement>('trail-review');
  const suggest = get<HTMLButtonElement>('trail-suggest');
  tool.onclick = actions.start;
  get('trail-close').onclick = get('trail-cancel').onclick = actions.close;
  undo.onclick = actions.undo;
  review.onclick = actions.review;
  confirm.onclick = actions.confirm;
  suggest.onclick = actions.suggested;
  get('trail-toggle').onclick = actions.toggle;
  get('trail-demolish').onclick = actions.demolish;
  registry.onchange = () => actions.select(Number(registry.value));
  width.onchange = () => actions.width(Number(width.value) as TrailWidth);
  form.onsubmit = event => { event.preventDefault(); actions.rename(name.value); };
  get('trail-limits').textContent = `At least ${TRAIL.minLength} m long and ${TRAIL.minDrop} m downhill. Avoid cliffs, sustained climbs, and lift station footprints. Amber highlights steep or invalid ground. Orange dots mark conifers to clear.`;
  return {
    update(draft: TrailDraft | undefined, chosen: BuiltTrail | undefined, resort: ReturnType<typeof createResort>) {
      const records = [...resort.trails.values()];
      registry.replaceChildren(new Option('Inspect a trail…',''), ...records.map(trail => new Option(trail.name,String(trail.id))));
      registry.hidden = !records.length;
      registry.value = chosen ? String(chosen.id) : '';
      tool.setAttribute('aria-pressed',String(Boolean(draft)));
      panel.hidden = !draft && !chosen;
      const stage = draft ? draft.reviewing ? 'review' : 'draw' : chosen ? 'inspect' : '';
      if (stage !== mode) {
        mode = stage;
        showDetails(!(compactDefault.matches && (stage === 'draw' || stage === 'inspect')));
        get<HTMLDetailsElement>('trail-grade-details').open = false;
      }
      if (panel.hidden) return;
      terrain.hidden = true;
      get('trail-editor').hidden = !draft;
      get('trail-draft-actions').hidden = !draft;
      get('trail-status').hidden = !chosen;
      get('trail-manager').hidden = !chosen;
      const route = draft?.plan?.route ?? chosen?.route;
      const connection = draft?.plan?.connections ?? chosen?.connections;
      const badge = get('trail-difficulty');
      badge.textContent = route ? route.difficulty : '';
      badge.style.setProperty('--trail-color',route ? trailColors[route.difficulty] : '#647985');
      badge.hidden = !route;
      get('trail-title').textContent = chosen?.name ?? resort.nextTrailName;
      get('trail-metrics').innerHTML = route ? displayStats(route, chosen?.cost ?? route.cost, Boolean(draft)) : '';
      get('trail-grade-details').hidden = !route;
      get('trail-grades').textContent = route
        ? Object.entries(route.distribution).map(([band, distance]) => `${band} ${pct(distance / route.length * 100)}`).join(' · ') + ` · Raw maximum ${pct(route.rawMaximum)}`
        : '';
      get('trail-links').textContent = connection ? links(connection,resort) : '';
      const status = chosen ? resort.circuitStatus(chosen) : draft?.plan?.circuit;
      get('trail-circuit').textContent = status ?? '';
      get('trail-circuit').dataset.usable = String(status?.startsWith('Usable circuit') ?? false);
      get('trail-snap').textContent = draft?.snap ??
        (draft?.zones?.length ? 'Teal: upper zone · Gold: lower zone · Tap near a marked anchor to snap.' : '');
      if (draft) {
        width.value = String(draft.width);
        get('trail-step').textContent = draft.reviewing ? 'Review construction' : draft.points.length ? `Draw route · ${draft.points.length} point(s)` : 'Place the high start point';
        const issues = draft.plan?.issues ?? [];
        get('trail-feedback').textContent = draft.message ?? (draft.points.length >= 2 ? issues.join(' ') || 'Ready for review.' : 'Tap the snow to place a waypoint.');
        get('trail-feedback').dataset.invalid = String(Boolean(draft.message || (draft.points.length >= 2 && issues.length)));
        undo.disabled = !draft.points.length;
        undo.textContent = draft.reviewing ? 'Back' : 'Undo';
        review.hidden = draft.reviewing;
        review.disabled = !route || !!issues.length;
        confirm.hidden = !draft.reviewing;
        confirm.disabled = !route || !!issues.length;
        suggest.hidden = draft.reviewing;
        suggest.textContent = draft.points.length ? 'Point toward the base' : resort.lifts.size ? 'Start near upper station' : 'Start near upper bench';
      } else if (chosen) {
        get('trail-status').textContent = chosen.open ? 'Open' : 'Closed';
        get('trail-toggle').textContent = chosen.open ? 'Close trail' : 'Open trail';
        name.value = chosen.name;
      }
    }
  };
}
