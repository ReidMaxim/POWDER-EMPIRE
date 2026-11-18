import { FIXED_GRIP, type LiftAlignment } from './alignment.ts';
import type { Draft } from './construction.ts';
import type { OperatingLift } from './resort.ts';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US');
const meters = (n: number) => number.format(Math.round(n)) + ' m';
const ride = (plan: LiftAlignment) => {
  const seconds = Math.round(plan.uphillLength / FIXED_GRIP.speed);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

interface Actions {
  start(): void;
  cancel(): void;
  back(): void;
  surveyed(): void;
  confirm(): void;
  toggle(): void;
  demolish(): void;
  select(id: number): void;
}

export function bindLiftPanel(root: HTMLElement, actions: Actions) {
  const get = <E extends HTMLElement>(id: string) => root.querySelector<E>('#' + id)!;
  const terrain = get('terrain-panel');
  const panel = get('lift-panel');
  const tool = get<HTMLButtonElement>('lift-tool');
  const funds = get('resort-funds');
  const registry = get<HTMLSelectElement>('lift-registry');
  const build = get('lift-build');
  const manage = get('lift-manage');
  const step = get('lift-step');
  const feedback = get('lift-feedback');
  const summary = get('lift-summary');
  const status = get('lift-status');
  const back = get<HTMLButtonElement>('lift-back');
  const confirm = get<HTMLButtonElement>('lift-confirm');
  const surveyed = get<HTMLButtonElement>('lift-surveyed');
  const toggle = get<HTMLButtonElement>('lift-toggle');
  const title = get('lift-title');
  const detail = get('lift-detail');
  const rule = FIXED_GRIP;
  get('lift-limits-text').textContent = `Terminal grade ≤${rule.maxStationGrade}%. Keep ${rule.stationRadius} m from the edge. Span ${rule.minRun}–${rule.maxRun} m with at least ${rule.minRise} m rise. Cable clearance ≥${rule.minClearance} m, towers ≤${rule.maxTowerHeight} m, and ${rule.corridor} m between lifts.`;
  tool.onclick = actions.start;
  back.onclick = actions.back;
  confirm.onclick = actions.confirm;
  surveyed.onclick = actions.surveyed;
  toggle.onclick = actions.toggle;
  registry.onchange = () => actions.select(Number(registry.value));
  get('lift-cancel').onclick = actions.cancel;
  get('lift-dismiss').onclick = actions.cancel;
  get('lift-demolish').onclick = actions.demolish;

  function statistics(plan: LiftAlignment, managing: boolean) {
    const values = [
      ['Length', meters(plan.uphillLength)], ['Vertical rise', meters(plan.rise)], ['Ride time', ride(plan)],
      ['Cost', currency.format(plan.cost)]
    ];
    if (managing) {
      const capacity = Math.floor(3600 * FIXED_GRIP.speed * plan.chairCount * FIXED_GRIP.passengers / plan.loopLength);
      values.push(['Chairs', String(plan.chairCount)], ['Est. capacity', number.format(capacity) + ' / hr']);
    }
    return values.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  }

  return {
    update(draft: Draft | undefined, lift: OperatingLift | undefined, nextName: string) {
      tool.setAttribute('aria-pressed', String(Boolean(draft)));
      terrain.hidden = !!draft || !!lift;
      panel.hidden = !draft && !lift;
      build.hidden = !draft;
      manage.hidden = !lift || !!draft;
      if (draft) {
        title.textContent = nextName;
        detail.textContent = 'FIXED-GRIP · TWO SEAT';
        step.textContent = draft.upper ? '3 · Review alignment' : draft.lower ? '2 · Place upper terminal' : '1 · Place lower terminal';
        const { alignment, issues } = draft.proposal;
        feedback.textContent = issues.join(' ') || (draft.upper ? 'Ready to build.' :
          draft.lower ? 'Select a higher point on the snow.' : 'Select a level point on the snow.');
        feedback.dataset.invalid = String(issues.length > 0);
        summary.hidden = !alignment;
        summary.innerHTML = alignment ? statistics(alignment, false) : '';
        back.disabled = !draft.lower;
        confirm.disabled = !alignment || issues.length > 0;
        surveyed.hidden = !!draft.upper;
        surveyed.textContent = draft.lower ? 'Use surveyed upper bench' : 'Use surveyed base bench';
        return;
      }
      if (lift) {
        title.textContent = lift.name;
        detail.textContent = 'FIXED-GRIP · TWO SEAT';
        status.textContent = lift.running ? 'Operating' : 'Stopped';
        status.dataset.running = String(lift.running);
        toggle.textContent = lift.running ? 'Stop lift' : 'Start lift';
        get('lift-stats').innerHTML = statistics(lift.alignment, true);
      }
    },
    budget(value: number, lifts: Iterable<OperatingLift>, current?: number) {
      funds.textContent = currency.format(value);
      const list = [...lifts];
      registry.hidden = !list.length;
      const placeholder = new Option('Inspect a lift…', '');
      const options = list.map(lift => new Option(lift.name, String(lift.id)));
      registry.replaceChildren(placeholder, ...options);
      registry.value = current === undefined ? '' : String(current);
    },
    notice(message: string) {
      const note = get('lift-notice');
      note.hidden = !message;
      note.textContent = message;
    }
  };
}
