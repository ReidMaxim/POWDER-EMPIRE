import { economy } from './economy';
import type { createResort } from '../lifts/resort';
import type { createGuestSimulation } from '../guests/simulation';

const currency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
export const dollars = (n:number) => currency.format(n);
type Resort = ReturnType<typeof createResort>;
type Visitors = ReturnType<typeof createGuestSimulation>;
type Proposal = ReturnType<Resort['entrancePlan']>;

export function bindBusinessPanel(root: HTMLElement, actions: {
  place(): void; accept(): void; cancel(): void; suggested(): void;
  price(price: number): void; toggle(): void; endDay(): void; nextDay(): void;
}) {
  const dock = document.createElement('section');
  dock.className = 'business-dock';
  dock.innerHTML = `
    <button id="business-toggle" class="panel" aria-expanded="false" aria-controls="business-panel">Resort <b id="business-tag">Closed</b></button>
    <div id="business-panel" class="panel lift-panel" hidden>
      <div class="panel-title"><div><span class="eyebrow">OPENING DAY</span><h2>Resort office</h2></div><button id="business-close" aria-label="Close resort office">×</button></div>
      <div class="lift-content">
        <p id="business-status" role="status"></p>
        <dl class="lift-stats business-overview">
          <div><dt>Cash</dt><dd id="business-cash"></dd></div><div><dt>Net today</dt><dd id="business-net"></dd></div>
          <div><dt>Tickets sold</dt><dd id="business-admissions"></dd></div><div><dt>Active guests</dt><dd id="business-active"></dd></div>
        </dl>
        <form id="ticket-form" class="ticket-form"><label for="ticket-price">Day ticket</label>
          <input id="ticket-price" type="number" min="${economy.minPrice}" max="${economy.maxPrice}" step="1" required inputmode="numeric">
          <button type="submit">Set price</button>
        </form>
        <button type="button" id="entrance-place" class="lift-primary">Place entrance</button>
        <p id="business-access"></p>
        <div class="lift-actions business-actions">
          <button id="business-operate" class="lift-primary">Open resort</button>
          <button id="business-end">End day</button><button id="business-next" class="lift-primary">Next day</button>
        </div>
        <details id="business-details" class="lift-limits"><summary id="business-details-title">Financial details</summary>
          <dl class="lift-stats">
            <div><dt>Ticket revenue</dt><dd id="business-revenue"></dd></div><div><dt>Lift expenses</dt><dd id="business-expenses"></dd></div>
            <div><dt>Satisfaction</dt><dd id="business-rating"></dd></div><div><dt>Reputation</dt><dd id="business-reputation"></dd></div>
            <div><dt>Ski runs</dt><dd id="business-runs"></dd></div><div><dt id="business-balance-label">Ticket price</dt><dd id="business-balance"></dd></div>
          </dl>
        </details>
      </div>
    </div>
    <aside id="entrance-panel" class="panel lift-panel" aria-label="Entrance construction" hidden>
      <div class="panel-title"><div><span class="eyebrow">GUEST ARRIVAL</span><h2>Resort entrance</h2></div></div>
      <div class="lift-content">
        <p>Pick level snow near the base, or use the surveyed site.</p>
        <p id="entrance-feedback" role="status"></p>
        <div class="lift-actions"><button id="entrance-suggested">Surveyed site</button><button id="entrance-cancel">Cancel</button>
          <button id="entrance-confirm" class="lift-primary">Build ${dollars(economy.entranceCost)}</button></div>
      </div>
    </aside>`;
  root.append(dock);
  const get = <E extends HTMLElement = HTMLElement>(id: string) => dock.querySelector<E>('#'+id)!;
  const panel = get('business-panel'), tag = get('business-toggle'), entrance = get('entrance-panel');
  const input = get<HTMLInputElement>('ticket-price'), details = get<HTMLDetailsElement>('business-details');
  let phase = '';
  const show = (open:boolean) => {panel.hidden = !open;tag.setAttribute('aria-expanded',String(open));};
  tag.onclick = () => { if (!entrance.hidden) actions.cancel(); show(Boolean(panel.hidden)); };
  get('business-close').onclick = () => show(false);
  get('entrance-place').onclick = actions.place;
  get('entrance-cancel').onclick = actions.cancel;
  get('entrance-confirm').onclick = actions.accept;
  get('entrance-suggested').onclick = actions.suggested;
  get('business-operate').onclick = actions.toggle;
  get('business-end').onclick = actions.endDay;
  get('business-next').onclick = actions.nextDay;
  get<HTMLFormElement>('ticket-form').onsubmit = event => {
    event.preventDefault();
    actions.price(input.valueAsNumber);
    input.blur();
  };
  return {
    show, open: () => !panel.hidden,
    draft(proposal?: Proposal, affordable = false, usable = false) {
      entrance.hidden = !proposal;
      if (!proposal) return;
      show(false);
      get('entrance-feedback').textContent = proposal.issues.join(' ') ||
        (!affordable ? 'Insufficient funds.' : usable ? 'Connected to an operating lift and usable ski circuit.' :
          proposal.paths.length ? 'Lift approach is walkable. Add or open a suitable ski circuit.' :
          'Site is ready. Build a lift and trail to open the resort.');
      get<HTMLButtonElement>('entrance-confirm').disabled = !!proposal.issues.length || !affordable;
    },
    update(resort: Resort, visitors: Visitors) {
      const data = resort.business.data, admin = visitors.stats();
      const report = data.phase === 'report', open = data.phase === 'open', ending = data.phase === 'ending';
      const minute = economy.openingHour*60 + Math.floor(data.time/60);
      const clock = Math.floor(minute/60) + ':' + String(minute%60).padStart(2,'0');
      const label = open ? 'Open' : report ? 'Day report' : ending ? 'Closing' : 'Closed';
      get('business-tag').textContent = label;
      get('business-status').textContent = `Day ${data.day} · ${clock} · ${label}`;
      const header = root.querySelector<HTMLElement>('#resort-day');
      if (header) header.textContent = `Day ${data.day} · ${clock}`;
      const funds = root.querySelector<HTMLElement>('#resort-funds');
      if (funds && funds.textContent !== dollars(resort.funds)) funds.textContent = dollars(resort.funds);
      if (panel.hidden) return;
      if (phase !== data.phase) {
        phase = data.phase;
        if (report) details.open = true;
      }
      const {ledger} = data;
      const rating = ledger.admissions ? Math.round(ledger.ratings/ledger.admissions)+'%' : '—';
      const fields = {cash:dollars(resort.funds),net:dollars(ledger.revenue-ledger.expenses),admissions:ledger.admissions,
        active:admin.guests,revenue:dollars(ledger.revenue),expenses:dollars(ledger.expenses),rating,
        reputation:Math.round(data.reputation)+'%', runs:ledger.runs,balance:dollars(report?data.endingCash ?? resort.funds:data.price)};
      for (const [key,value] of Object.entries(fields)) get('business-'+key).textContent = String(value);
      get('business-details-title').textContent = report ? 'End-of-day report' : 'Financial details';
      get('business-balance-label').textContent = report ? 'Ending cash' : 'Ticket price';
      if (document.activeElement !== input && input.value !== String(data.price)) input.value = String(data.price);
      get('entrance-place').hidden = !!data.entrance;
      const operate = get<HTMLButtonElement>('business-operate');
      operate.textContent = open ? 'Close resort' : 'Open resort';
      operate.hidden = ending || report;
      operate.disabled = !open && (!data.entrance || !admin.circuits || resort.funds < 1);
      get('business-end').hidden = data.phase !== 'closed';
      get('business-next').hidden = !report;
      get('business-access').textContent = ending
        ? (admin.riding && [...resort.lifts.values()].some(l=>!l.running)
          ? 'Waiting for guests to leave. Restart a stopped lift if riders are waiting.' : 'Waiting for guests to leave.')
        : data.cashHold ? 'Operations paused for low cash. Active guests can finish and leave.'
        : !data.entrance ? 'Build an entrance before admitting guests.'
        : !admin.circuits ? admin.circuitHint : report ? '' : `${admin.circuits} usable ski circuit${admin.circuits===1?'':'s'}.`;
    }
  };
}
